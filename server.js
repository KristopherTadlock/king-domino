import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const ROOT = process.cwd();

/** @type {Map<string, {seed:number, players:{token:string,name:string}[], sockets:Set<any>, actions:any[]}>} */
const rooms = new Map();

function randomToken() {
  return (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)).slice(0, 40);
}

function playerNames(room) {
  return room.players.map((p) => p.name);
}

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
      send(ws, { type: 'pong', t: Date.now() });
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

      let room = rooms.get(roomId);
      if (!room) {
        const seed = Number.isFinite(msg.proposedSeed) ? (msg.proposedSeed >>> 0) : ((Math.random() * 2 ** 32) >>> 0);
        room = { seed, players: [], sockets: new Set(), actions: [] };
        rooms.set(roomId, room);
      }

      joinedRoomId = roomId;
      room.sockets.add(ws);

      // Assign player slots (2 players for now). Reconnect uses stable playerToken.
      const token = playerToken || randomToken();
      const existingIndex = room.players.findIndex((p) => p.token === token);
      if (existingIndex !== -1) {
        assignedIndex = existingIndex;
        assignedToken = token;
        // Refresh name on reconnect.
        if (name) room.players[existingIndex].name = name;
      } else if (room.players.length < 2) {
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
        playerToken: assignedToken,
        players: playerNames(room),
        actions: room.actions,
      });

      broadcast(room, { type: 'players', players: playerNames(room) });
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

      // Basic validation: limit action size.
      const payload = action.payload && typeof action.payload === 'object' ? action.payload : {};
      const cleanAction = { type: action.type, payload };
      room.actions.push(cleanAction);
      broadcast(room, { type: 'action', action: cleanAction });
      return;
    }
  });

  ws.on('close', () => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (!room) return;
    room.sockets.delete(ws);
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
