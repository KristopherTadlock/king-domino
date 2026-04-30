import { randomSeed } from './utils/rng.js';

/**
 * Thin websocket client for syncing a deterministic game.
 * Server broadcasts an ordered action log; clients replay into local game engine.
 */
export class MultiplayerClient {
  /** @type {WebSocket | null} */
  #ws = null;

  /** @type {boolean} */
  #shouldReconnect = true;

  /** @type {number} */
  #reconnectAttempt = 0;

  /** @type {number | null} */
  #reconnectTimer = null;

  /** @type {number | null} */
  #pingTimer = null;

  /** @type {any[]} */
  #outbox = [];

  /** @type {boolean} */
  #usesExplicitPlayerToken = false;

  roomId;
  name;

  /** @type {number | null} */
  playerIndex = null;

  /** @type {number | null} */
  seed = null;

  /** @type {{type:string, payload:any}[]} */
  actions = [];

  /**
   * @param {{ roomId: string, name: string, playerToken?: string, url?: string, onJoined: Function, onAction: Function, onPlayers: Function, onError: Function, onStatus?: Function }} opts
   */
  constructor(opts) {
    this.roomId = opts.roomId;
    this.name = opts.name;
    this.onJoined = opts.onJoined;
    this.onAction = opts.onAction;
    this.onPlayers = opts.onPlayers;
    this.onError = opts.onError;
    this.onStatus = opts.onStatus;
    this.url = opts.url;

    const explicitToken = typeof opts.playerToken === 'string' ? opts.playerToken.trim() : '';
    this.#usesExplicitPlayerToken = !!explicitToken;
    this.playerToken = explicitToken || MultiplayerClient.getOrCreatePlayerToken();
  }

  connect() {
    this.#shouldReconnect = true;
    this.#clearReconnectTimer();
    this.#clearPing();
    this.onStatus?.({ state: 'connecting' });

    const wsUrl = this.url || MultiplayerClient.defaultWsUrl();
    this.#ws = new WebSocket(wsUrl);
    this.#ws.addEventListener('open', () => {
      this.#reconnectAttempt = 0;
      this.onStatus?.({ state: 'open' });
      this.send({
        type: 'join',
        roomId: this.roomId,
        name: this.name,
        playerToken: this.playerToken,
        // If the server is creating a room, allow client to propose a seed.
        proposedSeed: randomSeed(),
      });

      this.#flushOutbox();
      this.#startPing();
    });
    this.#ws.addEventListener('message', (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.#handle(msg);
    });
    this.#ws.addEventListener('close', () => {
      this.#clearPing();
      this.onStatus?.({ state: 'closed' });
      if (this.#shouldReconnect) {
        this.#scheduleReconnect();
      } else {
        this.onError?.('Disconnected from server.');
      }
    });
    this.#ws.addEventListener('error', () => {
      // Let close() handle reconnect/error; Safari sometimes emits error without useful details.
    });
  }

  disconnect() {
    this.#shouldReconnect = false;
    this.#clearReconnectTimer();
    this.#clearPing();
    this.#ws?.close();
  }

  sendAction(type, payload = {}) {
    this.send({ type: 'action', roomId: this.roomId, action: { type, payload } });
  }

  send(obj) {
    // Safari can be slow to open the socket on cold start; queue messages to avoid drops.
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
      this.#outbox.push(obj);
      return;
    }
    this.#ws.send(JSON.stringify(obj));
  }

  #handle(msg) {
    switch (msg.type) {
      case 'joined': {
        this.playerIndex = msg.playerIndex;
        this.seed = msg.seed;
        this.actions = msg.actions || [];
        if (typeof msg.playerToken === 'string' && msg.playerToken) {
          this.playerToken = msg.playerToken;
          if (!this.#usesExplicitPlayerToken) {
            MultiplayerClient.persistPlayerToken(this.playerToken);
          }
        }
        this.onPlayers?.(msg.players || []);
        this.onJoined?.({ playerIndex: this.playerIndex, seed: this.seed, actions: this.actions, players: msg.players || [] });
        return;
      }
      case 'pong': {
        // keepalive ack; nothing else to do
        return;
      }
      case 'players': {
        this.onPlayers?.(msg.players || []);
        return;
      }
      case 'action': {
        this.actions.push(msg.action);
        this.onAction?.(msg.action);
        return;
      }
      case 'error': {
        this.onError?.(msg.message || 'Server error');
        return;
      }
    }
  }

  static defaultWsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  #flushOutbox() {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) return;
    if (!this.#outbox.length) return;

    const pending = this.#outbox;
    this.#outbox = [];
    for (const obj of pending) {
      try {
        this.#ws.send(JSON.stringify(obj));
      } catch {
        // If it fails mid-flush, put remaining back and wait for reconnect.
        this.#outbox.unshift(obj);
        break;
      }
    }
  }

  #scheduleReconnect() {
    this.#clearReconnectTimer();
    this.#reconnectAttempt += 1;
    const base = 350;
    const max = 5000;
    const backoff = Math.min(max, base * 2 ** (this.#reconnectAttempt - 1));
    const jitter = Math.floor(Math.random() * 200);
    const delay = backoff + jitter;
    this.onStatus?.({ state: 'reconnecting', attempt: this.#reconnectAttempt, delay });
    this.#reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  #clearReconnectTimer() {
    if (this.#reconnectTimer != null) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
  }

  #startPing() {
    this.#clearPing();
    // App-level ping (browser WebSocket cannot send protocol ping frames).
    this.#pingTimer = setInterval(() => {
      this.send({ type: 'ping', t: Date.now() });
    }, 20000);
  }

  #clearPing() {
    if (this.#pingTimer != null) {
      clearInterval(this.#pingTimer);
      this.#pingTimer = null;
    }
  }

  static getOrCreatePlayerToken() {
    try {
      const existing = localStorage.getItem('kd.playerToken');
      if (existing) return existing;

      let token = '';
      if (globalThis.crypto?.getRandomValues) {
        const bytes = new Uint8Array(16);
        globalThis.crypto.getRandomValues(bytes);
        token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      } else {
        token = Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
      }

      localStorage.setItem('kd.playerToken', token);
      return token;
    } catch {
      return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
    }
  }

  static persistPlayerToken(token) {
    try {
      localStorage.setItem('kd.playerToken', token);
    } catch {
      // ignore
    }
  }
}
