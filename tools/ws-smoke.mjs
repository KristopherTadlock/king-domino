import WebSocket from 'ws';

const base = process.argv[2];
if (!base) {
  console.error('Usage: node tools/ws-smoke.mjs <ws(s)://host/ws>');
  process.exit(2);
}

const roomId = `smoke-${Math.random().toString(16).slice(2, 7)}`;

function join(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(base);
    ws.once('open', () => {
      ws.send(JSON.stringify({ type: 'join', roomId, name, proposedSeed: 123 }));
    });
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.type === 'joined') resolve(ws);
    });
    ws.once('error', reject);
  });
}

const alice = await join('Alice');
const bob = await join('Bob');

await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout waiting for broadcast')), 2000);
  bob.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.type === 'action' && msg.action?.type === 'rotate') {
      clearTimeout(t);
      resolve();
    }
  });

  alice.send(JSON.stringify({
    type: 'action',
    roomId,
    action: { type: 'rotate', payload: {} },
  }));
});

console.log('OK: broadcast over tunnel works');
alice.close();
bob.close();
