import express from 'express';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = process.env.WA_SESSIONS_DIR || path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const app = express();
app.use(express.json());

// userId -> { sock, store, storeTimer, qr, status, phone }
const sessions = {};

// Pending fetchMessageHistory calls: uid -> { resolve, timer }
const pendingHistoryFetch = {};

function _getText(msg) {
  if (!msg?.message) return '';
  const m = msg.message;
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    ''
  );
}

// Silent pino-compatible logger
const _logger = { level: 'silent', trace(){}, debug(){}, info(){}, warn(){}, error(){}, fatal(){}, child(){ return this; } };

// ── Manual Store ────────────────────────────────────────────────────────────
class WAStore {
  constructor() {
    this.chats    = new Map(); // jid -> chat object
    this.messages = new Map(); // jid -> Map(id -> WAMessage)
    this.contacts = new Map(); // jid -> contact object
    this.receipts = new Map(); // wamid -> { status: 'delivered'|'read', ts }
  }

  addReceipt(wamid, status, ts) {
    const ex = this.receipts.get(wamid);
    if (!ex || (status === 'read' && ex.status !== 'read')) {
      this.receipts.set(wamid, { status, ts: ts || Date.now() });
    }
  }

  popReceipts() {
    const result = Array.from(this.receipts.entries()).map(([wamid, r]) => ({ wamid, ...r }));
    this.receipts.clear();
    return result;
  }

  _msgs(jid) {
    if (!this.messages.has(jid)) this.messages.set(jid, new Map());
    return this.messages.get(jid);
  }

  upsertChats(chats = []) {
    for (const c of chats) {
      if (!c.id) continue;
      this.chats.set(c.id, { ...(this.chats.get(c.id) || {}), ...c });
    }
  }

  updateChats(updates = []) {
    for (const u of updates) {
      if (!u.id) continue;
      this.chats.set(u.id, { ...(this.chats.get(u.id) || { id: u.id }), ...u });
    }
  }

  upsertMessages(messages = []) {
    for (const msg of messages) {
      const jid = msg.key?.remoteJid;
      if (!jid) continue;
      this._msgs(jid).set(msg.key.id, msg);
      // _toMs not defined yet at class definition; use inline Long-safe conversion
      const raw = msg.messageTimestamp;
      let ts = 0;
      if (raw) {
        if (typeof raw === 'object' && raw.low !== undefined) {
          ts = ((raw.high >>> 0) * 4294967296 + (raw.low >>> 0));
        } else {
          ts = Number(raw) || 0;
        }
      }
      if (ts > 0) {
        const chat = this.chats.get(jid) || { id: jid };
        const existTs = typeof chat.conversationTimestamp === 'object' && chat.conversationTimestamp?.low !== undefined
          ? ((chat.conversationTimestamp.high >>> 0) * 4294967296 + (chat.conversationTimestamp.low >>> 0))
          : Number(chat.conversationTimestamp || 0);
        if (ts > existTs) {
          this.chats.set(jid, { ...chat, conversationTimestamp: ts });
        }
      }
    }
  }

  upsertContacts(contacts = []) {
    for (const c of contacts) {
      if (!c.id) continue;
      this.contacts.set(c.id, { ...(this.contacts.get(c.id) || {}), ...c });
    }
  }

  updateContacts(updates = []) {
    for (const u of updates) {
      if (!u.id) continue;
      this.contacts.set(u.id, { ...(this.contacts.get(u.id) || { id: u.id }), ...u });
    }
  }

  messagesFor(jid) {
    return Array.from((this.messages.get(jid) || new Map()).values());
  }

  toJSON() {
    return {
      chats:    Array.from(this.chats.entries()),
      messages: Array.from(this.messages.entries()).map(([j, m]) => [j, Array.from(m.entries())]),
      contacts: Array.from(this.contacts.entries()),
    };
  }

  fromJSON(d) {
    if (d.chats)    this.chats    = new Map(d.chats);
    if (d.messages) this.messages = new Map(d.messages.map(([j, m]) => [j, new Map(m)]));
    if (d.contacts) this.contacts = new Map(d.contacts);
  }

  writeToFile(f) { fs.writeFileSync(f, JSON.stringify(this.toJSON()), 'utf-8'); }
  readFromFile(f) { this.fromJSON(JSON.parse(fs.readFileSync(f, 'utf-8'))); }
}

// ── Session management ───────────────────────────────────────────────────────

async function startSession(userId) {
  const uid = String(userId);
  const existing = sessions[uid];
  if (existing && (existing.status === 'connected' || existing.status === 'starting')) {
    return existing;
  }

  const dir = path.join(SESSIONS_DIR, uid);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const storeFile = path.join(dir, 'store.json');

  const store = new WAStore();
  if (fs.existsSync(storeFile)) {
    try { store.readFromFile(storeFile); } catch (e) {
      console.warn(`[${uid}] store load error: ${e.message}`);
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  const session = { sock: null, store, storeTimer: null, qr: null, status: 'starting', phone: null };
  sessions[uid] = session;

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: _logger,
    browser: ['DataVision Outreach', 'Chrome', '120.0.0'],
    connectTimeoutMs: 60_000,
    getMessage: async (key) => {
      const msgs = session.store.messages.get(key.remoteJid);
      return msgs?.get(key.id)?.message || undefined;
    },
  });
  session.sock = sock;

  // Persist store to disk every 30s
  session.storeTimer = setInterval(() => {
    try { store.writeToFile(storeFile); } catch {}
  }, 30_000);

  // ── Event listeners ──

  sock.ev.on('messaging-history.set', ({ chats = [], messages = [], contacts = [], isLatest }) => {
    console.log(`[${uid}] history.set: ${chats.length} chats, ${messages.length} msgs, ${contacts.length} contacts, isLatest=${isLatest}`);
    store.upsertChats(chats);
    store.upsertMessages(messages);
    store.upsertContacts(contacts);
    console.log(`[${uid}] store now: ${store.chats.size} chats, ${store.contacts.size} contacts`);

    if (pendingHistoryFetch[uid]) {
      clearTimeout(pendingHistoryFetch[uid].timer);
      pendingHistoryFetch[uid].resolve();
      delete pendingHistoryFetch[uid];
    }
  });

  sock.ev.on('chats.upsert', (chats) => store.upsertChats(chats));
  sock.ev.on('chats.update', (updates) => store.updateChats(updates));
  sock.ev.on('messages.upsert', ({ messages }) => store.upsertMessages(messages));
  sock.ev.on('contacts.upsert', (contacts) => store.upsertContacts(contacts));
  sock.ev.on('contacts.update', (updates) => store.updateContacts(updates));

  // Receipt ACKs — fired when WhatsApp server confirms delivery or read
  sock.ev.on('messages.update', (updates) => {
    for (const { key, update } of updates) {
      if (!key?.id || !key.fromMe) continue;
      const status = update?.status;
      if (status === 3) store.addReceipt(key.id, 'delivered', Date.now());
      else if (status >= 4) store.addReceipt(key.id, 'read', Date.now());
    }
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try { session.qr = await QRCode.toDataURL(qr); } catch {}
      session.status = 'waiting_qr';
    }

    if (connection === 'open') {
      session.status = 'connected';
      session.qr = null;
      const rawId = sock.user?.id || '';
      session.phone = rawId.split(':')[0].split('@')[0];
      console.log(`[${uid}] conectado: ${session.phone}`);
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log(`[${uid}] desconectado — código: ${reason}`);
      clearInterval(session.storeTimer);
      try { store.writeToFile(storeFile); } catch {}

      if (reason === DisconnectReason.loggedOut) {
        delete sessions[uid];
        fs.rmSync(dir, { recursive: true, force: true });
      } else {
        session.status = 'reconnecting';
        session.sock = null;
        setTimeout(() => startSession(uid).catch(() => {}), 4000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  return session;
}

// Restore persisted sessions on boot
for (const entry of fs.readdirSync(SESSIONS_DIR)) {
  const full = path.join(SESSIONS_DIR, entry);
  if (fs.statSync(full).isDirectory()) {
    startSession(entry).catch((e) => console.warn(`No se pudo restaurar sesión ${entry}:`, e.message));
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Handle both plain numbers and proto Long objects
function _toMs(ts) {
  if (!ts) return 0;
  if (typeof ts === 'object' && ts.low !== undefined) {
    return ((ts.high >>> 0) * 4294967296 + (ts.low >>> 0)) * 1000;
  }
  const n = Number(ts);
  return isNaN(n) ? 0 : n * 1000;
}

function _storeMessages(store, jid) {
  return store.messagesFor(jid)
    .map(m => ({
      id: m.key.id,
      fromMe: !!m.key.fromMe,
      body: _getText(m),
      ts: _toMs(m.messageTimestamp),
      pushName: m.pushName || '',
    }))
    .filter(m => m.body)
    .sort((a, b) => a.ts - b.ts);
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

app.post('/session/:userId/start', async (req, res) => {
  try {
    await startSession(req.params.userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/session/:userId/qr', (req, res) => {
  const s = sessions[String(req.params.userId)];
  if (!s) return res.json({ status: 'not_started', qr: null, phone: null });
  res.json({ status: s.status, qr: s.qr, phone: s.phone });
});

app.get('/session/:userId/status', (req, res) => {
  const s = sessions[String(req.params.userId)];
  if (!s) return res.json({ status: 'not_started', phone: null });
  res.json({ status: s.status, phone: s.phone });
});

app.post('/session/:userId/send', async (req, res) => {
  const uid = String(req.params.userId);
  const s = sessions[uid];
  if (!s || s.status !== 'connected') {
    return res.status(400).json({ ok: false, error: 'Sesión no conectada' });
  }
  const { to, jid, message } = req.body || {};
  if ((!to && !jid) || !message) {
    return res.status(400).json({ ok: false, error: 'Faltan destino (to/jid) y message' });
  }
  try {
    let targetJid = '';
    if (jid && String(jid).includes('@')) {
      targetJid = String(jid).trim();
    } else {
      const digits = String(to || '').replace(/\D/g, '');
      if (!digits) return res.status(400).json({ ok: false, error: 'Destino invalido' });
      targetJid = `${digits}@s.whatsapp.net`;
    }
    const sent = await s.sock.sendMessage(targetJid, { text: message });
    res.json({ ok: true, wamid: sent?.key?.id || '' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/session/:userId/profile', (req, res) => {
  const uid = String(req.params.userId);
  const s = sessions[uid];
  if (!s?.sock) return res.json({ ok: false, profile: null });
  const me = s.sock.user || {};
  const profile = {
    id: me.id || '',
    name: me.name || '',
    phone: (me.id || '').split(':')[0].split('@')[0] || s.phone || '',
    status: s.status || 'unknown',
  };
  return res.json({ ok: true, profile });
});

app.get('/session/:userId/chats', (req, res) => {
  const uid = String(req.params.userId);
  const s = sessions[uid];
  if (!s?.store) return res.json({ ok: true, chats: [] });

  const { store } = s;
  const chats = [];

  for (const chat of store.chats.values()) {
    const jid = chat.id;
    if (!jid || jid === 'status@broadcast') continue;

    const allMsgs = store.messagesFor(jid);

    // Track last message regardless of type (for timestamp)
    const lastMsgAny = allMsgs.length > 0
      ? allMsgs.reduce((a, b) => _toMs(a.messageTimestamp) >= _toMs(b.messageTimestamp) ? a : b, allMsgs[0])
      : null;

    // Track last text message (for preview)
    let lastText = '';
    let lastFromMe = false;
    for (let i = allMsgs.length - 1; i >= 0; i--) {
      const t = _getText(allMsgs[i]);
      if (t) { lastText = t; lastFromMe = !!allMsgs[i].key?.fromMe; break; }
    }

    // lastAt: prefer actual message timestamp, fall back to chat metadata
    const lastAt = lastMsgAny
      ? _toMs(lastMsgAny.messageTimestamp)
      : _toMs(chat.conversationTimestamp);

    const contact = store.contacts.get(jid);
    const name = contact?.name || contact?.notify || chat.name || '';

    chats.push({ jid, name, lastMessage: lastText, lastAt, lastFromMe, unread: chat.unreadCount || 0 });
  }

  chats.sort((a, b) => b.lastAt - a.lastAt);
  // Show all chats that have any timestamp — including those with only metadata
  res.json({ ok: true, chats: chats.filter(c => c.lastAt > 0) });
});

app.get('/session/:userId/debug', (req, res) => {
  const uid = String(req.params.userId);
  const s = sessions[uid];
  if (!s) return res.json({ ok: false, error: 'No session' });
  const { store, status, phone } = s;
  const chatList = store ? Array.from(store.chats.values()).slice(0, 10).map(c => ({
    id: c.id, name: c.name, ts: _toMs(c.conversationTimestamp),
    msgs: (store.messages.get(c.id) || new Map()).size,
  })) : [];
  res.json({
    ok: true, status, phone,
    chats: store?.chats.size || 0,
    messages: store ? Array.from(store.messages.values()).reduce((a, m) => a + m.size, 0) : 0,
    contacts: store?.contacts.size || 0,
    sample: chatList,
  });
});

app.get('/session/:userId/messages', (req, res) => {
  const uid = String(req.params.userId);
  const s = sessions[uid];
  const jid = req.query.jid;
  if (!jid) return res.status(400).json({ ok: false, error: 'jid requerido' });
  if (!s?.store) return res.json({ ok: true, messages: [], name: '' });

  const { store } = s;
  const contact = store.contacts.get(jid);
  const name = contact?.name || contact?.notify || '';

  // Reset unread count
  const chat = store.chats.get(jid);
  if (chat?.unreadCount) store.chats.set(jid, { ...chat, unreadCount: 0 });

  res.json({ ok: true, messages: _storeMessages(store, jid), name });
});

app.post('/session/:userId/fetch-history', async (req, res) => {
  const uid = String(req.params.userId);
  const s = sessions[uid];
  if (!s?.sock || s.status !== 'connected') {
    return res.status(400).json({ ok: false, error: 'Sesión no conectada' });
  }
  const { jid } = req.body || {};
  if (!jid) return res.status(400).json({ ok: false, error: 'jid requerido' });

  const allMsgs = s.store.messagesFor(jid)
    .sort((a, b) => Number(a.messageTimestamp) - Number(b.messageTimestamp));
  const oldest = allMsgs[0];

  if (!oldest) return res.json({ ok: true, messages: [], fetched: 0 });

  const prevCount = allMsgs.length;

  try {
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (pendingHistoryFetch[uid]) delete pendingHistoryFetch[uid];
        resolve();
      }, 12000);
      pendingHistoryFetch[uid] = { resolve, timer };

      s.sock.fetchMessageHistory(100, oldest.key, Number(oldest.messageTimestamp))
        .catch(() => {
          clearTimeout(timer);
          if (pendingHistoryFetch[uid]) delete pendingHistoryFetch[uid];
          resolve();
        });
    });

    const newMessages = _storeMessages(s.store, jid);
    res.json({ ok: true, messages: newMessages, fetched: Math.max(0, newMessages.length - prevCount) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/session/:userId/receipts', (req, res) => {
  const uid = String(req.params.userId);
  const s = sessions[uid];
  if (!s?.store) return res.json({ ok: true, receipts: [] });
  res.json({ ok: true, receipts: s.store.popReceipts() });
});

app.get('/session/:userId/contacts', (req, res) => {
  const uid = String(req.params.userId);
  const s = sessions[uid];
  if (!s?.store) return res.json({ ok: true, contacts: [] });

  const contacts = Array.from(s.store.contacts.values())
    .filter(c => c.id && !c.id.includes('@g.us') && !c.id.includes('@broadcast') && (c.name || c.notify))
    .map(c => ({ jid: c.id, name: c.name || c.notify || '', phone: c.id.split('@')[0] }))
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json({ ok: true, contacts });
});

app.delete('/session/:userId', async (req, res) => {
  const uid = String(req.params.userId);
  const s = sessions[uid];
  if (s?.sock) { try { await s.sock.logout(); } catch {} }
  clearInterval(s?.storeTimer);
  delete sessions[uid];
  const dir = path.join(SESSIONS_DIR, uid);
  fs.rmSync(dir, { recursive: true, force: true });
  res.json({ ok: true });
});

app.get('/health', (_, res) => res.json({ ok: true, sessions: Object.keys(sessions).length }));

const PORT = process.env.WA_BRIDGE_PORT || 3001;
app.listen(PORT, () => console.log(`WA Bridge corriendo en :${PORT}`));
