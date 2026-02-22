/**
 * Draw Together — P2P Network Manager
 * Handles room creation, peer connections, and data sync via PeerJS
 */

class NetworkManager {
  constructor() {
    this.peer = null;
    this.connections = new Map(); // peerId -> { conn, username, color }
    this.roomId = null;
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
   * Create a new room (become host)
   */
  async createRoom(username) {
    this.username = username;
    this.isHost = true;

    return new Promise((resolve, reject) => {
      // Generate a short room ID
      this.roomId = this._generateRoomId();
      const peerId = 'dt-' + this.roomId;

      this.peer = new Peer(peerId, {
        debug: 0
      });

      this.peer.on('open', (id) => {
        console.log('[Network] Host ready, room:', this.roomId);
        if (this.onReady) this.onReady();
        resolve(this.roomId);
      });

      this.peer.on('connection', (conn) => {
        this._handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('[Network] Error:', err);
        if (err.type === 'unavailable-id') {
          // Room ID collision, retry
          this.peer.destroy();
          this.roomId = this._generateRoomId();
          this.createRoom(username).then(resolve).catch(reject);
        } else {
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
   * Join an existing room
   */
  async joinRoom(username, roomId) {
    this.username = username;
    this.isHost = false;
    this.roomId = roomId.toUpperCase().trim();

    return new Promise((resolve, reject) => {
      const myId = 'dt-' + this._generateRoomId() + '-' + Date.now().toString(36);

      this.peer = new Peer(myId, {
        debug: 0
      });

      this.peer.on('open', () => {
        console.log('[Network] Connecting to room:', this.roomId);
        const hostPeerId = 'dt-' + this.roomId;
        const conn = this.peer.connect(hostPeerId, {
          reliable: true,
          metadata: { username: this.username, color: this.userColor }
        });

        conn.on('open', () => {
          this._handleConnection(conn);
          // Request sync from host
          conn.send({ type: 'sync-request', username: this.username, color: this.userColor });
          resolve(this.roomId);
        });

        conn.on('error', (err) => {
          console.error('[Network] Connection error:', err);
          if (this.onError) this.onError('Could not connect to room. Check the Room ID.');
          reject(err);
        });

        // Timeout
        setTimeout(() => {
          if (!conn.open) {
            if (this.onError) this.onError('Connection timeout. Room may not exist.');
            reject(new Error('Connection timeout'));
          }
        }, 10000);
      });

      this.peer.on('connection', (conn) => {
        // Other peers may connect to us too (mesh)
        this._handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('[Network] Peer error:', err);
        if (err.type === 'peer-unavailable') {
          if (this.onError) this.onError('Room not found. Check the Room ID and try again.');
        } else {
          if (this.onError) this.onError(err.message || err.type);
        }
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
