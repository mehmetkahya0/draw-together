/**
 * Draw Together — P2P Network Manager
 * Handles peer connections and data sync via PeerJS
 * Single global room — everyone shares the same canvas
 */

class NetworkManager {
  // Fixed room ID — everyone connects to the same room
  static GLOBAL_ROOM_ID = 'DRAW-TOGETHER-GLOBAL';

  constructor() {
    this.peer = null;
    this.connections = new Map(); // peerId -> { conn, username, color }
    this.roomId = NetworkManager.GLOBAL_ROOM_ID;
    this.isHost = false;
    this.username = '';
    this.userColor = this._randomColor();

    // Callbacks
    this.onPeerConnected = null;
    this.onPeerDisconnected = null;
    this.onStrokeReceived = null;
    this.onStrokesErased = null;
    this.onCursorUpdate = null;
    this.onSyncRequest = null;
    this.onSyncData = null;
    this.onReady = null;
    this.onError = null;
    this.onClearAll = null;
  }

  /**
   * Connect to the global room.
   * Tries to become host first; if host already exists, joins as peer.
   */
  async connect(username) {
    this.username = username;

    return new Promise((resolve, reject) => {
      // First, try to become host
      const hostPeerId = 'dt-' + this.roomId;

      this.peer = new Peer(hostPeerId, { debug: 0 });

      this.peer.on('open', (id) => {
        // We got the host ID — we are the host
        this.isHost = true;
        console.log('[Network] Became host of global room');
        if (this.onReady) this.onReady();
        resolve(this.roomId);
      });

      this.peer.on('connection', (conn) => {
        this._handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          // Host already exists — join as peer instead
          console.log('[Network] Host exists, joining as peer...');
          this.peer.destroy();
          this._joinAsGuest(username).then(resolve).catch(reject);
        } else {
          console.error('[Network] Error:', err);
          if (this.onError) this.onError(err.message || err.type);
          reject(err);
        }
      });

      this.peer.on('disconnected', () => {
        console.log('[Network] Disconnected, attempting reconnect...');
        this.peer.reconnect();
      });
    });
  }

  /**
   * Join as guest (internal, called when host ID is taken)
   */
  async _joinAsGuest(username) {
    this.username = username;
    this.isHost = false;

    return new Promise((resolve, reject) => {
      const myId = 'dt-' + this._generateRoomId() + '-' + Date.now().toString(36);

      this.peer = new Peer(myId, { debug: 0 });

      this.peer.on('open', () => {
        console.log('[Network] Connecting to host...');
        const hostPeerId = 'dt-' + this.roomId;
        const conn = this.peer.connect(hostPeerId, {
          reliable: true,
          metadata: { username: this.username, color: this.userColor }
        });

        conn.on('open', () => {
          this._handleConnection(conn);
          conn.send({ type: 'sync-request', username: this.username, color: this.userColor });
          resolve(this.roomId);
        });

        conn.on('error', (err) => {
          console.error('[Network] Connection error:', err);
          if (this.onError) this.onError('Connection failed.');
          reject(err);
        });

        setTimeout(() => {
          if (!conn.open) {
            if (this.onError) this.onError('Connection timeout.');
            reject(new Error('Connection timeout'));
          }
        }, 10000);
      });

      this.peer.on('connection', (conn) => {
        this._handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('[Network] Peer error:', err);
        if (this.onError) this.onError(err.message || err.type);
        reject(err);
      });
    });
  }

  /**
   * Handle a new peer connection
   */
  _handleConnection(conn) {
    conn.on('open', () => {
      const meta = conn.metadata || {};
      const peerInfo = {
        conn: conn,
        username: meta.username || 'Anonymous',
        color: meta.color || this._randomColor()
      };

      this.connections.set(conn.peer, peerInfo);
      console.log('[Network] Peer connected:', peerInfo.username);

      if (this.onPeerConnected) {
        this.onPeerConnected(conn.peer, peerInfo.username, peerInfo.color);
      }

      // Send our identity
      conn.send({
        type: 'identity',
        username: this.username,
        color: this.userColor
      });
    });

    conn.on('data', (data) => {
      this._handleMessage(conn.peer, data);
    });

    conn.on('close', () => {
      const info = this.connections.get(conn.peer);
      this.connections.delete(conn.peer);
      console.log('[Network] Peer disconnected:', info?.username);
      if (this.onPeerDisconnected) {
        this.onPeerDisconnected(conn.peer, info?.username);
      }
    });

    conn.on('error', (err) => {
      console.error('[Network] Connection error with peer:', err);
    });
  }

  /**
   * Handle incoming messages
   */
  _handleMessage(fromPeerId, data) {
    switch (data.type) {
      case 'identity':
        if (this.connections.has(fromPeerId)) {
          const peerInfo = this.connections.get(fromPeerId);
          peerInfo.username = data.username;
          peerInfo.color = data.color;
          if (this.onPeerConnected) {
            this.onPeerConnected(fromPeerId, data.username, data.color);
          }
        }
        break;

      case 'stroke':
        if (this.onStrokeReceived) {
          this.onStrokeReceived(data.stroke);
        }
        // Relay to other peers (mesh)
        this._relay(fromPeerId, data);
        break;

      case 'erase':
        if (this.onStrokesErased) {
          this.onStrokesErased(data.strokeIds);
        }
        this._relay(fromPeerId, data);
        break;

      case 'cursor':
        if (this.onCursorUpdate) {
          this.onCursorUpdate(fromPeerId, data.x, data.y, data.username, data.color);
        }
        // Don't relay cursors — too much traffic
        break;

      case 'sync-request':
        // Update peer info
        if (this.connections.has(fromPeerId)) {
          const peerInfo = this.connections.get(fromPeerId);
          peerInfo.username = data.username;
          peerInfo.color = data.color;
        }
        if (this.onSyncRequest) {
          const syncData = this.onSyncRequest();
          const conn = this.connections.get(fromPeerId)?.conn;
          if (conn && conn.open) {
            conn.send({ type: 'sync-data', strokes: syncData });
          }
        }
        // Tell other peers about this new peer
        this._relay(fromPeerId, {
          type: 'peer-announce',
          peerId: fromPeerId,
          username: data.username,
          color: data.color
        });
        break;

      case 'sync-data':
        if (this.onSyncData) {
          this.onSyncData(data.strokes);
        }
        break;

      case 'peer-announce':
        // Connect to newly announced peer for mesh
        if (!this.connections.has(data.peerId) && data.peerId !== this.peer?.id) {
          const conn = this.peer.connect(data.peerId, {
            reliable: true,
            metadata: { username: this.username, color: this.userColor }
          });
          conn.on('open', () => this._handleConnection(conn));
        }
        break;

      case 'clear-all':
        if (this.onClearAll) {
          this.onClearAll();
        }
        this._relay(fromPeerId, data);
        break;
    }
  }

  /**
   * Relay message to all peers except the sender
   */
  _relay(fromPeerId, data) {
    for (const [peerId, peerInfo] of this.connections) {
      if (peerId !== fromPeerId && peerInfo.conn.open) {
        peerInfo.conn.send(data);
      }
    }
  }

  /**
   * Broadcast to all connected peers
   */
  broadcast(data) {
    for (const [peerId, peerInfo] of this.connections) {
      if (peerInfo.conn.open) {
        peerInfo.conn.send(data);
      }
    }
  }

  /**
   * Send a stroke to all peers
   */
  sendStroke(stroke) {
    this.broadcast({ type: 'stroke', stroke });
  }

  /**
   * Send erased stroke IDs
   */
  sendErase(strokeIds) {
    this.broadcast({ type: 'erase', strokeIds });
  }

  /**
   * Send cursor position (throttled by caller)
   */
  sendCursor(x, y) {
    this.broadcast({
      type: 'cursor',
      x, y,
      username: this.username,
      color: this.userColor
    });
  }

  /**
   * Send clear all command
   */
  sendClearAll() {
    this.broadcast({ type: 'clear-all' });
  }

  /**
   * Get connected peer count
   */
  getPeerCount() {
    return this.connections.size;
  }

  /**
   * Get all connected peers info
   */
  getPeers() {
    const peers = [];
    for (const [id, info] of this.connections) {
      peers.push({ id, username: info.username, color: info.color });
    }
    return peers;
  }

  /**
   * Disconnect and cleanup
   */
  destroy() {
    if (this.peer) {
      this.peer.destroy();
    }
    this.connections.clear();
  }

  // ── Helpers ──

  _generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 5; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }

  _randomColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 60%)`;
  }
}
