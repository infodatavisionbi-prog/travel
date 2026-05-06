const http = require('http')
const fs   = require('fs')
const path = require('path')
const { exec } = require('child_process')

const DIST = path.join(__dirname, 'dist')
const PORT = 3000

const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'application/javascript',
  '.mjs':   'application/javascript',
  '.css':   'text/css',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.gif':   'image/gif',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.json':  'application/json',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
}

function tryServe(res, filePath) {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return false
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(fs.readFileSync(filePath))
    return true
  } catch {
    return false
  }
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0].split('#')[0]
  if (tryServe(res, path.join(DIST, urlPath))) return
  // SPA fallback
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(fs.readFileSync(path.join(DIST, 'index.html')))
})

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`
  console.log(`\n  DataVision BI  →  ${url}`)
  console.log('  Ctrl+C para cerrar\n')
  const cmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
    ? `open "${url}"`
    : `xdg-open "${url}"`
  exec(cmd)
})
