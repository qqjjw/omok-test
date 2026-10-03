import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createApp } from '../server.js';

function mailbox(ws) {
  const queue = [], waiters = [];
  ws.on('message', raw => {
    const data = JSON.parse(raw.toString());
    if (waiters.length) waiters.shift()(data); else queue.push(data);
  });
  return async () => {
    if (queue.length) return queue.shift();
    let timer;
    return Promise.race([
      new Promise(resolve => waiters.push(resolve)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Message timeout')), 2000); }),
    ]).finally(() => clearTimeout(timer));
  };
}

test('two people share colors, removals and reconnect state; third connection is refused', async t => {
  const app = createApp();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const address = `http://127.0.0.1:${app.server.address().port}`;
  const open = async () => {
    const ws = new WebSocket(address.replace('http:', 'ws:') + '/ws');
    const next = mailbox(ws);
    await once(ws, 'open');
    return { ws, next };
  };
  assert.equal((await fetch(address + '/health')).status, 200);
  assert.equal((await fetch(address + '/')).status, 200);
  assert.equal((await fetch(address + '/server/server.js')).status, 404);
  const a = await open();
  assert.equal((await a.next()).players, 1);
  const b = await open();
  assert.equal((await b.next()).players, 2);
  assert.equal((await a.next()).players, 2);
  const c = await open();
  const rejectedClose = once(c.ws, 'close');
  assert.equal((await c.next()).type, 'full');
  assert.equal((await rejectedClose)[0], 4003);
  a.ws.send(JSON.stringify({type:'place',x:7,y:7,color:'white',revision:0}));
  const first = await a.next();
  assert.equal(first.board[112], 'white');
  assert.deepEqual(await b.next(), first);
  b.ws.send(JSON.stringify({type:'place',x:8,y:7,color:'black',revision:1}));
  const second = await a.next();
  assert.equal(second.board[113], 'black');
  assert.deepEqual(await b.next(), second);
  a.ws.send(JSON.stringify({type:'remove',x:7,y:7,revision:0}));
  assert.equal((await a.next()).type, 'error');
  assert.equal((await a.next()).board[112], 'white');
  b.ws.send(JSON.stringify({type:'remove',x:7,y:7,revision:2}));
  const removed = await a.next();
  assert.equal(removed.board[112], null);
  assert.equal(removed.revision, 3);
  assert.deepEqual(await b.next(), removed);
  b.ws.send(JSON.stringify({type:'place',x:99,y:0,color:'black',revision:3}));
  assert.equal((await b.next()).type, 'error');
  assert.equal((await b.next()).revision, 3);
  const bClosed = once(b.ws, 'close'); b.ws.close(); await bClosed;
  assert.equal((await a.next()).players, 1);
  const returning = await open();
  const restored = await returning.next();
  assert.equal(restored.revision, 3);
  assert.equal(restored.board[113], 'black');
  assert.equal(restored.players, 2);
});

test('unapproved browser origins cannot connect', async t => {
  const app = createApp();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/ws`, { origin: 'https://unapproved.example' });
  const [error] = await once(ws, 'error');
  assert.match(error.message, /403/);
});
