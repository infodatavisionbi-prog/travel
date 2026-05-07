import express from 'express';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
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
app.use(express.json({ limit: '64mb' }));

// userId -> { sock, store, storeTimer, qr, status, phone }
const sessions = {};

// Pending fetchMessageHistory calls: uid -> { resolve, timer }
const pendingHistoryFetch = {};

// SSE clients: uid -> Set<res>
const sseClients = {};

function pushEvent(uid, event) {
  const clients = sseClients[String(uid)];
  if (!clients?.size) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) { try { res.write(data); } catch {} }
}

// Strip device suffix (:0) and normalize @c.us → @s.whatsapp.net
function _normalizeJid(jid) {
  if (!jid || typeof jid !== 'string') return jid;
  return jid.replace(/:[\d]+@/, '@').replace('@c.us', '@s.whatsapp.net');
}

// Unwrap ephemeral / view-once / document-with-caption wrappers
function _unwrap(message) {
  if (!message) return {};
  return (
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message?.viewOnceMessage?.message ||
    message.documentWithCaptionMessage?.message ||
    message
  );
}

function _getText(msg) {
  if (!msg?.message) return '';
  const m = _unwrap(msg.message);
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
      const id = _normalizeJid(c.id);
      this.chats.set(id, { ...(this.chats.get(id) || {}), ...c, id });
    }
  }

  updateChats(updates = []) {
    for (const u of updates) {
      if (!u.id) continue;
      const id = _normalizeJid(u.id);
      this.chats.set(id, { ...(this.chats.get(id) || { id }), ...u, id });
    }
  }

  upsertMessages(messages = []) {
    for (const msg of messages) {
      const rawJid = msg.key?.remoteJid;
      if (!rawJid) continue;
      const jid = _normalizeJid(rawJid);
      // Store with normalized JID
      const normalized = rawJid === jid ? msg : { ...msg, key: { ...msg.key, remoteJid: jid } };
      this._msgs(jid).set(msg.key.id, normalized);
      // Update chat timestamp
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
      const id = _normalizeJid(c.id);
      this.contacts.set(id, { ...(this.contacts.get(id) || {}), ...c, id });
    }
  }

  updateContacts(updates = []) {
    for (const u of updates) {
      if (!u.id) continue;
      const id = _normalizeJid(u.id);
      this.contacts.set(id, { ...(this.contacts.get(id) || { id }), ...u, id });
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

    pushEvent(uid, { type: 'chats_ready', chats: store.chats.size, contacts: store.contacts.size, isLatest: !!isLatest });

    if (pendingHistoryFetch[uid]) {
      clearTimeout(pendingHistoryFetch[uid].timer);
      pendingHistoryFetch[uid].resolve();
      delete pendingHistoryFetch[uid];
    }
  });

  sock.ev.on('chats.upsert', (chats) => store.upsertChats(chats));
  sock.ev.on('chats.update', (updates) => store.updateChats(updates));
  sock.ev.on('messages.upsert', ({ messages }) => {
    store.upsertMessages(messages);
    const jids = new Set(messages.map(m => m.key?.remoteJid).filter(Boolean));
    for (const jid of jids) pushEvent(uid, { type: 'new_message', jid });
  });
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
      pushEvent(uid, { type: 'status', status: 'connected', phone: session.phone });
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log(`[${uid}] desconectado — código: ${reason}`);
      clearInterval(session.storeTimer);
      try { store.writeToFile(storeFile); } catch {}

      if (reason === DisconnectReason.loggedOut) {
        pushEvent(uid, { type: 'status', status: 'not_started', phone: null });
        delete sessions[uid];
        fs.rmSync(dir, { recursive: true, force: true });
      } else {
        session.status = 'reconnecting';
        session.sock = null;
        pushEvent(uid, { type: 'status', status: 'reconnecting', phone: session.phone });
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

// ── Media helpers ─────────────────────────────────────────────────────────────

function _getMediaType(msg) {
  if (!msg?.message) return null;
  const m = _unwrap(msg.message);
  if (m.imageMessage)    return { type: 'image',    mimetype: m.imageMessage.mimetype    || 'image/jpeg',               caption:  m.imageMessage.caption   || '' };
  if (m.audioMessage)    return { type: 'audio',    mimetype: m.audioMessage.mimetype    || 'audio/ogg; codecs=opus',   ptt: !!m.audioMessage.ptt, seconds: m.audioMessage.seconds || 0 };
  if (m.videoMessage)    return { type: 'video',    mimetype: m.videoMessage.mimetype    || 'video/mp4',                caption:  m.videoMessage.caption   || '' };
  if (m.documentMessage) return { type: 'document', mimetype: m.documentMessage.mimetype || 'application/octet-stream', fileName: m.documentMessage.fileName || 'archivo' };
  if (m.stickerMessage)  return { type: 'sticker',  mimetype: m.stickerMessage.mimetype  || 'image/webp',               isAnimated: !!m.stickerMessage.isAnimated };
  return null;
}

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
  const nJid = _normalizeJid(jid);
  return store.messagesFor(nJid)
    .map(m => {
      const media = _getMediaType(m);
      const body  = _getText(m);
      if (media) console.log(`[media] type=${media.type} jid=${nJid} id=${m.key?.id}`);
      return {
        id:       m.key.id,
        fromMe:   !!m.key.fromMe,
        body,
        ts:       _toMs(m.messageTimestamp),
        pushName: m.pushName || '',
        media,
      };
    })
    .filter(m => m.body || m.media)
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
  const { to, message } = req.body || {};
  if (!to || !message) {
    return res.status(400).json({ ok: false, error: 'Faltan to y message' });
  }
  try {
    const digits = String(to).replace(/\D/g, '');
    const jid = `${digits}@s.whatsapp.net`;
    const sent = await s.sock.sendMessage(jid, { text: message });
    res.json({ ok: true, wamid: sent?.key?.id || '' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
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
  const jid = _normalizeJid(req.query.jid);
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
  const jid = _normalizeJid(req.body?.jid || '');
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

// ── Media download ────────────────────────────────────────────────────────────

app.get('/session/:userId/media', async (req, res) => {
  const uid    = String(req.params.userId);
  const jid    = _normalizeJid(req.query.jid);
  const { msgId } = req.query;
  const s = sessions[uid];
  if (!s?.store) return res.status(404).json({ error: 'Sin sesión' });

  const msgs = s.store.messages.get(jid);
  const msg  = msgs?.get(msgId);
  if (!msg) {
    console.warn(`[${uid}] media not found — jid=${jid} msgId=${msgId} stored_jids=[${[...s.store.messages.keys()].slice(0,5).join(',')}]`);
    return res.status(404).json({ error: 'Mensaje no encontrado' });
  }

  const media = _getMediaType(msg);
  console.log(`[${uid}] media dl: type=${media?.type} mime=${media?.mimetype} jid=${jid}`);

  try {
    const buffer = await downloadMediaMessage(
      msg, 'buffer', {},
      { logger: _logger, reuploadRequest: s.sock ? s.sock.updateMediaMessage : undefined }
    );
    const mime = media?.mimetype || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (e) {
    console.error(`[${uid}] media dl error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Send media ────────────────────────────────────────────────────────────────

app.post('/session/:userId/send-media', async (req, res) => {
  const uid = String(req.params.userId);
  const s   = sessions[uid];
  if (!s?.sock || s.status !== 'connected') {
    return res.status(400).json({ ok: false, error: 'Sesión no conectada' });
  }

  const { to, type, data, caption = '', mimetype, filename = 'archivo' } = req.body || {};
  if (!to || !type || !data) {
    return res.status(400).json({ ok: false, error: 'Faltan to, type, data' });
  }

  const digits = String(to).replace(/\D/g, '');
  const jid    = `${digits}@s.whatsapp.net`;
  const buffer = Buffer.from(data, 'base64');

  let payload;
  switch (type) {
    case 'image':   payload = { image:    buffer, mimetype: mimetype || 'image/jpeg',                caption }; break;
    case 'audio':   payload = { audio:    buffer, mimetype: mimetype || 'audio/ogg; codecs=opus', ptt: false }; break;
    case 'video':   payload = { video:    buffer, mimetype: mimetype || 'video/mp4',               caption }; break;
    case 'sticker': payload = { sticker:  buffer, mimetype: mimetype || 'image/webp' }; break;
    default:        payload = { document: buffer, mimetype: mimetype || 'application/octet-stream', fileName: filename, caption };
  }

  try {
    const sent = await s.sock.sendMessage(jid, payload);
    res.json({ ok: true, wamid: sent?.key?.id || '' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/session/:userId/profile', async (req, res) => {
  const uid = String(req.params.userId);
  const s = sessions[uid];
  if (!s) return res.json({ ok: false, profile: null });

  const profile = {
    phone: s.phone || null,
    status: s.status,
    name: s.sock?.user?.name || null,
    id: s.sock?.user?.id || null,
  };

  // Try to fetch business profile if connected
  if (s.sock && s.status === 'connected' && s.phone) {
    try {
      const jid = `${s.phone}@s.whatsapp.net`;
      const biz = await s.sock.getBusinessProfile(jid).catch(() => null);
      if (biz) {
        profile.businessName = biz.name || null;
        profile.description  = biz.description || null;
        profile.category     = biz.category || null;
        profile.website      = biz.website?.[0] || null;
      }
    } catch {}
  }

  res.json({ ok: true, profile });
});

// ── Server-Sent Events ────────────────────────────────────────────────────────

app.get('/session/:userId/events', (req, res) => {
  const uid = String(req.params.userId);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  if (!sseClients[uid]) sseClients[uid] = new Set();
  sseClients[uid].add(res);

  // Send current state immediately
  const s = sessions[uid];
  const init = s
    ? { type: 'status', status: s.status, phone: s.phone, chats: s.store?.chats.size || 0, contacts: s.store?.contacts.size || 0 }
    : { type: 'status', status: 'not_started', phone: null, chats: 0, contacts: 0 };
  res.write(`data: ${JSON.stringify(init)}\n\n`);

  // Heartbeat every 20s to prevent proxy timeouts
  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 20_000);

  req.on('close', () => {
    clearInterval(hb);
    sseClients[uid]?.delete(res);
  });
});

app.get('/health', (_, res) => res.json({ ok: true, sessions: Object.keys(sessions).length }));

const PORT = process.env.WA_BRIDGE_PORT || 3001;
app.listen(PORT, () => console.log(`WA Bridge corriendo en :${PORT}`));
