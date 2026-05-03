import assert from 'node:assert/strict';
import WebSocket from 'ws';

const base = process.argv[2] || 'ws://127.0.0.1:8081/ws';
const roomId = `smoke-${Math.random().toString(16).slice(2, 8)}`;
const seed = 123;

function createClient(label) {
  const ws = new WebSocket(base);
  const queue = [];
  const waiters = [];

  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    const waiterIndex = waiters.findIndex((waiter) => waiter.matches(msg));
    if (waiterIndex !== -1) {
      const [waiter] = waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(msg);
      return;
    }

    queue.push(msg);
  });

  return {
    label,
    ws,
    async send(obj) {
      await opened;
      ws.send(JSON.stringify(obj));
    },
    waitFor(type, predicate = () => true, timeoutMs = 2000) {
      const queuedIndex = queue.findIndex((msg) => msg.type === type && predicate(msg));
      if (queuedIndex !== -1) {
        const [msg] = queue.splice(queuedIndex, 1);
        return Promise.resolve(msg);
      }

      return new Promise((resolve, reject) => {
        const waiter = {
          matches: (msg) => msg.type === type && predicate(msg),
          resolve,
          timer: null,
        };
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index !== -1) waiters.splice(index, 1);
          reject(new Error(`${label}: timeout waiting for ${type}`));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    close() {
      ws.close();
    },
  };
}

async function join(name, playerToken, proposedSeed = seed) {
  const client = createClient(name);
  await client.send({
    type: 'join',
    roomId,
    name,
    playerToken,
    proposedSeed,
  });
  client.joined = await client.waitFor('joined');
  return client;
}

const clients = [];
try {
  const alice = await join('Alice', 'alice-token');
  clients.push(alice);
  assert.equal(alice.joined.playerIndex, 0, 'first explicit token should claim player 0');
  assert.equal(alice.joined.seed, seed, 'room should use the first creator proposed seed');
  assert.equal(alice.joined.playerToken, 'alice-token');
  assert.deepEqual(alice.joined.players, ['Alice']);

  await alice.send({
    type: 'action',
    roomId,
    action: { type: 'rotate', payload: { playerIndex: 0 } },
  });
  const waitingError = await alice.waitFor('error', (msg) =>
    /waiting for another player/i.test(msg.message || '')
  );
  assert.equal(waitingError.type, 'error', 'solo players should be held in lobby until an opponent joins');

  const bob = await join('Bob', 'bob-token');
  clients.push(bob);
  assert.equal(bob.joined.playerIndex, 1, 'second explicit token should claim player 1');
  assert.equal(bob.joined.seed, seed, 'second join should inherit room seed');
  assert.deepEqual(bob.joined.players, ['Alice', 'Bob']);
  assert.equal(bob.joined.actions.length, 0, 'lobby-blocked actions should not enter gameplay history');

  const aliceReconnect = await join('Alice Again', 'alice-token');
  clients.push(aliceReconnect);
  assert.equal(aliceReconnect.joined.playerIndex, 0, 'same token should reconnect to the same player slot');
  assert.deepEqual(aliceReconnect.joined.players, ['Alice Again', 'Bob']);

  const spectator = await join('Spectator', 'spectator-token');
  clients.push(spectator);
  assert.equal(spectator.joined.playerIndex, null, 'third unique token should join as spectator');
  assert.deepEqual(spectator.joined.players, ['Alice Again', 'Bob']);

  await spectator.send({
    type: 'action',
    roomId,
    action: { type: 'rotate', payload: { playerIndex: 0 } },
  });
  const spectatorError = await spectator.waitFor('error', (msg) =>
    /spectators cannot play/i.test(msg.message || '')
  );
  assert.equal(spectatorError.type, 'error', 'spectators should not be able to mutate gameplay');

  const actionSeen = bob.waitFor('action', (msg) =>
    msg.action?.type === 'rotate'
    && msg.action?.payload?.playerIndex === 0
  );
  await alice.send({
    type: 'action',
    roomId,
    action: { type: 'rotate', payload: { playerIndex: 0 } },
  });
  const actionBroadcast = await actionSeen;
  assert.equal(actionBroadcast.action.type, 'rotate');

  const bobReconnect = await join('Bob Again', 'bob-token');
  clients.push(bobReconnect);
  assert.equal(bobReconnect.joined.playerIndex, 1);
  assert(
    bobReconnect.joined.actions.some((action) =>
      action.type === 'rotate' && action.payload?.playerIndex === 0
    ),
    'reconnect should receive gameplay action history'
  );

  const previewSeen = alice.waitFor('placementPreview', (msg) =>
    msg.preview?.playerIndex === 1
    && msg.preview?.dominoNumber === 15
  );
  await bob.send({
    type: 'placementPreview',
    roomId,
    preview: {
      dominoNumber: 15,
      orientation: 90,
      x: 1,
      y: 0,
      anchorEnd: 'RIGHT',
    },
  });
  const previewBroadcast = await previewSeen;
  assert.equal(previewBroadcast.preview.playerIndex, 1);
  assert.equal(previewBroadcast.preview.anchorEnd, 'RIGHT');

  const spectatorReconnect = await join('Spectator Again', 'spectator-again-token');
  clients.push(spectatorReconnect);
  assert(
    spectatorReconnect.joined.previews.some((preview) =>
      preview.playerIndex === 1
      && preview.dominoNumber === 15
      && preview.orientation === 90
    ),
    'new join should receive latest transient placement preview'
  );
  assert(
    !spectatorReconnect.joined.actions.some((action) => action.type === 'placementPreview'),
    'placement previews should not pollute gameplay action history'
  );

  const bobSeesAliceLeave = bob.waitFor('playerLeft', (msg) =>
    msg.playerIndex === 0
  );
  await alice.send({ type: 'leave', roomId });
  const leftBroadcast = await bobSeesAliceLeave;
  assert.equal(leftBroadcast.name, 'Alice Again');
  assert.deepEqual(leftBroadcast.players, ['', 'Bob Again']);

  await alice.send({
    type: 'action',
    roomId,
    action: { type: 'rotate', payload: { playerIndex: 0 } },
  });
  const inactiveError = await alice.waitFor('error', (msg) =>
    /no longer active/i.test(msg.message || '')
  );
  assert.equal(inactiveError.type, 'error', 'a vacated player socket should not control a refilled slot');

  const charlie = await join('Charlie', 'charlie-token');
  clients.push(charlie);
  assert.equal(charlie.joined.playerIndex, 0, 'new player should fill a vacated slot');
  assert.deepEqual(charlie.joined.players, ['Charlie', 'Bob Again']);

  const charlieActionSeen = bob.waitFor('action', (msg) =>
    msg.action?.type === 'rotate'
    && msg.action?.payload?.playerIndex === 0
  );
  await charlie.send({
    type: 'action',
    roomId,
    action: { type: 'rotate', payload: { playerIndex: 0 } },
  });
  const charlieActionBroadcast = await charlieActionSeen;
  assert.equal(charlieActionBroadcast.action.type, 'rotate');

  console.log(`OK: multiplayer room smoke passed for ${roomId}`);
} finally {
  for (const client of clients) client.close();
}
