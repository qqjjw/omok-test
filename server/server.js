import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const size = 15;
const root = new URL('../', import.meta.url);
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);

export function createApp({ allowedOrigins = ['https://qqjjw.github.io'] } = {}) {
  const board = Array(size * size).fill(null);
  let revision = 0;
  const peers = new Set();
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', players: peers.size }));
      return;
    }
    const file = files.get(pathname);
    if (!file || !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    try {
      const body = await readFile(new URL(file[0], root));
      res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(500); res.end('Unable to load page');
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    let permitted = false;
    try {
      const origin = req.headers.origin;
      const host = new URL(origin || 'http://localhost').host;
      permitted = new URL(req.url, 'http://localhost').pathname === '/ws'
        && (!origin || allowedOrigins.includes(origin) || host === req.headers.host);
    } catch { /* Malformed origins are rejected. */ }
    if (!permitted) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  const send = (ws, message) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  };
  const snapshot = () => ({ type: 'state', size, board, revision, players: peers.size });
  const broadcast = () => { for (const ws of peers) send(ws, snapshot()); };
  wss.on('connection', ws => {
    if (peers.size >= 2) {
      send(ws, { type: 'full', message: '이미 두 명이 접속해 있습니다. 잠시 후 다시 연결해 주세요.' });
      ws.close(4003, 'Board full'); return;
    }
    peers.add(ws);
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    let windowStart = Date.now(), messages = 0;
    const reject = message => { send(ws, { type: 'error', message }); send(ws, snapshot()); };
    ws.on('message', (raw, binary) => {
      if (Date.now() - windowStart >= 1000) { windowStart = Date.now(); messages = 0; }
      if (++messages > 30) { ws.close(4008, 'Too many messages'); return; }
      let msg;
      try { if (binary) throw new Error(); msg = JSON.parse(raw.toString()); }
      catch { reject('올바르지 않은 요청입니다.'); return; }
      if (!msg || !['place', 'remove'].includes(msg.type)
          || !Number.isInteger(msg.x) || !Number.isInteger(msg.y)
          || msg.x < 0 || msg.y < 0 || msg.x >= size || msg.y >= size
          || (msg.type === 'place' && !['black', 'white'].includes(msg.color))) {
        reject('돌의 위치와 색상을 확인해 주세요.'); return;
      }
      if (msg.revision !== revision) { reject('판이 변경되었습니다. 다시 선택해 주세요.'); return; }
      const index = msg.y * size + msg.x;
      if (msg.type === 'place' && board[index]) { reject('이미 돌이 있는 자리입니다.'); return; }
      if (msg.type === 'remove' && !board[index]) { reject('삭제할 돌이 없습니다.'); return; }
      board[index] = msg.type === 'place' ? msg.color : null;
      revision++;
      broadcast();
    });
    ws.on('error', () => {});
    ws.on('close', () => { peers.delete(ws); broadcast(); });
    broadcast();
  });
  const heartbeat = setInterval(() => {
    for (const ws of peers) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false; ws.ping();
    }
  }, 15000);
  heartbeat.unref();
  const close = async () => {
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  };
  return { server, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origins = (process.env.ALLOWED_ORIGINS || 'https://qqjjw.github.io').split(',').map(s => s.trim());
  const app = createApp({ allowedOrigins: origins });
  const port = Number(process.env.PORT || 8080);
  app.server.listen(port, '0.0.0.0', () => console.log(`Board server listening on ${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => app.close().then(() => process.exit(0)));
}
