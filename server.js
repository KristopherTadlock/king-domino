import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const ROOT = process.cwd();

/** @type {Map<string, {seed:number, playerCount:number, players:({token:string,name:string} | null)[], sockets:Set<any>, actions:any[], previews:Map<number, any>}>} */
const rooms = new Map();

function randomToken() {
  return (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)).slice(0, 40);
}

function playerNames(room) {
  return Array.from({ length: room.playerCount }, (_, index) => room.players[index]?.name || '');
}

function activePlayerCount(room) {
  return room.players.filter(Boolean).length;
}

function normalizePlayerCount(value) {
  const count = Number.parseInt(value, 10);
  if (!Number.isFinite(count)) return 2;
  return Math.max(2, Math.min(4, count));
}

function assignedPlayerIsActive(room, assignedIndex, assignedToken) {
  if (assignedIndex == null) return false;
  return room.players[assignedIndex]?.token === assignedToken;
}

function vacatePlayerSlot(room, playerIndex, playerToken) {
  if (playerIndex == null) return null;
  const player = room.players[playerIndex];
  if (!player || player.token !== playerToken) return null;

  room.players[playerIndex] = null;
  room.previews.delete(playerIndex);
  return player.name;
}

const GAMEPLAY_ACTION_TYPES = new Set([
  'pickDraft',
  'rotate',
  'skip',
  'selectPlacementTile',
  'setPlacementSelection',
  'place',
  'restart',
  'requestUndo',
  'approveUndo',
  'denyUndo',
]);

function contentTypeFor(p) {
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.json')) return 'application/json; charset=utf-8';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function safeResolve(urlPath) {
  const clean = urlPath.split('?')[0].split('#')[0];
  const decoded = decodeURIComponent(clean);
  const rel = decoded === '/' ? '/index.html' : decoded;
  const full = path.join(ROOT, rel);
  if (!full.startsWith(ROOT)) return null;
  return full;
}

const server = http.createServer(async (req, res) => {
  try {
    const filePath = safeResolve(req.url || '/');
    if (!filePath) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    res.setHeader('Content-Type', contentTypeFor(filePath));
    // No cache during dev
    res.setHeader('Cache-Control', 'no-store');
    createReadStream(filePath).pipe(res);
  } catch (e) {
    res.writeHead(500);
    res.end('Server Error');
  }
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if ((req.url || '').startsWith('/ws')) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

function send(ws, obj) {
  ws.send(JSON.stringify(obj));
}

function broadcast(room, obj) {
  const message = JSON.stringify(obj);
  room.sockets.forEach((ws) => {
    try {
      ws.send(message);
    } catch {
      // ignore
    }
  });
}

function broadcastPlayers(room) {
  broadcast(room, {
    type: 'players',
    playerCount: room.playerCount,
    players: playerNames(room),
  });
}

wss.on('connection', (ws) => {
  let joinedRoomId = null;
  let assignedIndex = null;
  let assignedToken = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'ping') {
      const room = joinedRoomId ? rooms.get(joinedRoomId) : null;
      send(ws, {
        type: 'pong',
        t: Date.now(),
        playerCount: room?.playerCount,
        players: room ? playerNames(room) : undefined,
      });
      return;
    }

    if (msg.type === 'join') {
      const roomId = String(msg.roomId || '').trim();
      const name = String(msg.name || 'Player').trim().slice(0, 24);
      const playerToken = String(msg.playerToken || '').trim();
      if (!roomId) {
        send(ws, { type: 'error', message: 'Missing roomId' });
        return;
      }

      const requestedPlayerCount = normalizePlayerCount(msg.playerCount);
      let room = rooms.get(roomId);
      if (!room) {
        const seed = Number.isFinite(msg.proposedSeed) ? (msg.proposedSeed >>> 0) : ((Math.random() * 2 ** 32) >>> 0);
        room = {
          seed,
          playerCount: requestedPlayerCount,
          players: Array(requestedPlayerCount).fill(null),
          sockets: new Set(),
          actions: [],
          previews: new Map(),
        };
        rooms.set(roomId, room);
      } else if (room.actions.length === 0 && requestedPlayerCount > room.playerCount) {
        room.playerCount = requestedPlayerCount;
        while (room.players.length < room.playerCount) room.players.push(null);
      }

      joinedRoomId = roomId;
      room.sockets.add(ws);

      // Assign player slots. Reconnect uses stable playerToken.
      const token = playerToken || randomToken();
      const existingIndex = room.players.findIndex((p) => p?.token === token);
      if (existingIndex !== -1) {
        assignedIndex = existingIndex;
        assignedToken = token;
        // Refresh name on reconnect.
        if (name && room.players[existingIndex]) room.players[existingIndex].name = name;
      } else if (room.players.some((p) => p == null)) {
        assignedIndex = room.players.findIndex((p) => p == null);
        assignedToken = token;
        room.players[assignedIndex] = { token, name: name || `Player ${assignedIndex + 1}` };
      } else if (room.players.length < room.playerCount) {
        assignedIndex = room.players.length;
        assignedToken = token;
        room.players.push({ token, name: name || `Player ${assignedIndex + 1}` });
      } else {
        assignedIndex = null; // spectator
        assignedToken = token;
      }

      send(ws, {
        type: 'joined',
        roomId,
        playerIndex: assignedIndex,
        seed: room.seed,
        playerCount: room.playerCount,
        playerToken: assignedToken,
        players: playerNames(room),
        actions: room.actions,
        previews: [...room.previews.values()],
      });
      ws.kingDominoPlayerIndex = assignedIndex;
      ws.kingDominoPlayerToken = assignedToken;

      broadcastPlayers(room);
      return;
    }

    if (msg.type === 'leave') {
      const roomId = String(msg.roomId || '').trim();
      const room = rooms.get(roomId);
      if (!room || joinedRoomId !== roomId) return;

      const leftName = vacatePlayerSlot(room, assignedIndex, assignedToken);
      if (leftName != null) {
        const players = playerNames(room);
        broadcast(room, {
          type: 'placementPreview',
          preview: { playerIndex: assignedIndex, clear: true },
        });
        broadcast(room, {
          type: 'playerLeft',
          playerIndex: assignedIndex,
          name: leftName,
          players,
        });
        broadcastPlayers(room);
      }
      return;
    }

    if (msg.type === 'action') {
      const roomId = String(msg.roomId || '').trim();
      const action = msg.action;
      if (!roomId || !action || typeof action.type !== 'string') return;
      const room = rooms.get(roomId);
      if (!room) {
        send(ws, { type: 'error', message: 'Room not found' });
        return;
      }
      if (joinedRoomId !== roomId) {
        send(ws, { type: 'error', message: 'Join the room before playing.' });
        return;
      }

      // Basic validation: limit action size.
      const payload = action.payload && typeof action.payload === 'object' ? action.payload : {};
      const cleanAction = { type: action.type, payload };
      if (GAMEPLAY_ACTION_TYPES.has(cleanAction.type)) {
        if (assignedIndex == null) {
          send(ws, { type: 'error', message: 'Room is full. Spectators cannot play.' });
          return;
        }
        if (!assignedPlayerIsActive(room, assignedIndex, assignedToken)) {
          send(ws, { type: 'error', message: 'That player slot is no longer active.' });
          return;
        }
        if (activePlayerCount(room) < room.playerCount) {
          send(ws, { type: 'error', message: 'Waiting for all players to join.' });
          return;
        }
        if (Number.isInteger(payload.playerIndex) && payload.playerIndex !== assignedIndex) {
          send(ws, { type: 'error', message: 'That action belongs to another player.' });
          return;
        }
      }
      room.actions.push(cleanAction);
      broadcast(room, { type: 'action', action: cleanAction });
      return;
    }

    if (msg.type === 'placementPreview') {
      const roomId = String(msg.roomId || '').trim();
      const room = rooms.get(roomId);
      if (!room || !assignedPlayerIsActive(room, assignedIndex, assignedToken)) return;
      if (joinedRoomId !== roomId) return;

      const preview = msg.preview && typeof msg.preview === 'object' ? msg.preview : {};
      const clear = Boolean(preview.clear);
      if (clear) {
        room.previews.delete(assignedIndex);
        broadcast(room, {
          type: 'placementPreview',
          preview: { playerIndex: assignedIndex, clear: true },
        });
        return;
      }

      const x = Number(preview.x);
      const y = Number(preview.y);
      const dominoNumber = Number(preview.dominoNumber);
      const orientation = Number(preview.orientation);
      const anchorEnd = preview.anchorEnd === 'RIGHT' ? 'RIGHT' : 'LEFT';
      if (
        !Number.isInteger(x)
        || !Number.isInteger(y)
        || !Number.isInteger(dominoNumber)
        || ![0, 90, 180, 270].includes(orientation)
      ) {
        return;
      }

      const cleanPreview = {
        playerIndex: assignedIndex,
        dominoNumber,
        orientation,
        x,
        y,
        anchorEnd,
        t: Date.now(),
      };
      room.previews.set(assignedIndex, cleanPreview);
      broadcast(room, { type: 'placementPreview', preview: cleanPreview });
      return;
    }
  });

  ws.on('close', () => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (!room) return;
    room.sockets.delete(ws);
    const samePlayerStillConnected = [...room.sockets].some((peer) =>
      peer.kingDominoPlayerIndex === assignedIndex
      && peer.kingDominoPlayerToken === assignedToken
    );
    if (assignedIndex != null && !samePlayerStillConnected) {
      room.previews.delete(assignedIndex);
      broadcast(room, {
        type: 'placementPreview',
        preview: { playerIndex: assignedIndex, clear: true },
      });
      if (room.actions.length === 0) {
        vacatePlayerSlot(room, assignedIndex, assignedToken);
        broadcastPlayers(room);
      }
    }
    if (room.sockets.size === 0) {
      // Clean up empty rooms.
      rooms.delete(joinedRoomId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Multiplayer server listening on http://127.0.0.1:${PORT}`);
  console.log('WebSocket endpoint at /ws');
});
