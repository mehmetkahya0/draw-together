/**
 * Draw Together — Main Application
 * Orchestrates canvas, tools, UI, and networking
 */

(function () {
  'use strict';

  // ── State ──
  let canvas;
  let network;
  let currentTool = 'pen';
  let currentColor = '#ffffff';
  let currentSize = 3;
  const remoteCursors = new Map();
  let cursorThrottleTimer = null;
  const CURSOR_THROTTLE_MS = 50;

  // ── Color Presets ──
  const COLOR_PRESETS = [
    '#ffffff', '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3',
    '#54a0ff', '#5f27cd', '#01a3a4', '#00d2d3', '#1dd1a1',
    '#f368e0', '#ff6348', '#ffa502', '#2ed573', '#70a1ff',
    '#a29bfe', '#fd79a8', '#e17055', '#636e72', '#2d3436'
  ];

  // ── DOM Elements ──
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ── Initialize ──
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    setupLobby();
    buildColorPresets();
    setupToolbar();
    setupZoomControls();
    setupSizeSlider();
  }

  // ── Lobby ──

  function setupLobby() {
    const createBtn = $('#createRoomBtn');
    const joinBtn = $('#joinRoomBtn');
    const usernameInput = $('#lobbyUsername');
    const roomIdInput = $('#lobbyRoomId');

    createBtn.addEventListener('click', async () => {
      const name = usernameInput.value.trim();
      if (!name) {
        usernameInput.focus();
        shakeElement(usernameInput);
        return;
      }
      createBtn.disabled = true;
      joinBtn.disabled = true;
      createBtn.textContent = 'Creating...';
      try {
        await startSession(name, null);
      } catch (e) {
        createBtn.disabled = false;
        joinBtn.disabled = false;
        createBtn.textContent = '✦ Create Room';
        showToast('Failed to create room: ' + (e.message || e));
      }
    });

    joinBtn.addEventListener('click', async () => {
      const name = usernameInput.value.trim();
      const roomId = roomIdInput.value.trim();
      if (!name) {
        usernameInput.focus();
        shakeElement(usernameInput);
        return;
      }
      if (!roomId) {
        roomIdInput.focus();
        shakeElement(roomIdInput);
        return;
      }
      createBtn.disabled = true;
      joinBtn.disabled = true;
      joinBtn.textContent = 'Joining...';
      try {
        await startSession(name, roomId);
      } catch (e) {
        createBtn.disabled = false;
        joinBtn.disabled = false;
        joinBtn.textContent = '→ Join Room';
        showToast('Failed to join: ' + (e.message || e));
      }
    });

    // Enter key support
    usernameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') createBtn.click();
    });
    roomIdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinBtn.click();
    });
  }

  async function startSession(username, roomId) {
    network = new NetworkManager();

    // Setup network callbacks
    network.onPeerConnected = (peerId, name, color) => {
      updateUsersPanel();
      showToast(`${name} joined`);
    };

    network.onPeerDisconnected = (peerId, name) => {
      removeRemoteCursor(peerId);
      updateUsersPanel();
      showToast(`${name || 'A user'} left`);
    };

    network.onStrokeReceived = (stroke) => {
      canvas.addStroke(stroke);
    };

    network.onStrokesErased = (strokeIds) => {
      canvas.removeStrokesById(strokeIds);
    };

    network.onCursorUpdate = (peerId, x, y, name, color) => {
      updateRemoteCursor(peerId, x, y, name, color);
    };

    network.onSyncRequest = () => {
      return canvas.getAllStrokes();
    };

    network.onSyncData = (strokes) => {
      for (const s of strokes) {
        canvas.addStroke(s);
      }
      showToast('Canvas synced!');
    };

    network.onClearAll = () => {
      canvas.clearAll();
      showToast('Canvas cleared');
    };

    network.onError = (msg) => {
      showToast('Error: ' + msg);
    };

    // Connect
    let resultRoomId;
    if (!roomId) {
      resultRoomId = await network.createRoom(username);
    } else {
      resultRoomId = await network.joinRoom(username, roomId);
    }

    // Transition to canvas
    hideLobby();
    initCanvas();
    updateRoomIdDisplay(resultRoomId);
    updateUsersPanel();
  }

  function hideLobby() {
    const lobby = $('.lobby-screen');
    lobby.classList.add('hidden');
    setTimeout(() => { lobby.style.display = 'none'; }, 500);
  }

  // ── Canvas Init ──

  function initCanvas() {
    const canvasEl = $('#mainCanvas');
    canvas = new InfiniteCanvas(canvasEl);

    canvas.setTool(currentTool);
    canvas.setColor(currentColor);
    canvas.setSize(currentSize);

    canvas.onStrokeComplete = (stroke) => {
      network.sendStroke(stroke);
    };

    canvas.onStrokesErased = (ids) => {
      network.sendErase(ids);
    };

    canvas.onCursorMove = (x, y) => {
      if (!cursorThrottleTimer) {
        cursorThrottleTimer = setTimeout(() => {
          network.sendCursor(x, y);
          cursorThrottleTimer = null;
        }, CURSOR_THROTTLE_MS);
      }
    };

    // Update zoom display
    const zoomEl = $('.zoom-level');
    const updateZoom = () => {
      if (zoomEl) zoomEl.textContent = canvas.getZoomPercent() + '%';
    };

    // Poll zoom level
    setInterval(updateZoom, 100);
    updateZoom();
  }

  // ── Toolbar ──

  function setupToolbar() {
    const toolBtns = $$('.toolbar-btn[data-tool]');
    toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;

        if (tool === 'color') {
          togglePanel('color-panel');
          return;
        }
        if (tool === 'size') {
          togglePanel('size-panel');
          return;
        }
        if (tool === 'clear') {
          if (confirm('Clear the entire canvas for everyone?')) {
            if (canvas) canvas.clearAll();
            if (network) network.sendClearAll();
            showToast('Canvas cleared');
          }
          return;
        }

        currentTool = tool;
        if (canvas) canvas.setTool(tool);

        // Update active states
        toolBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Close panels
        closeAllPanels();

        // Update cursor
        const canvasEl = $('#mainCanvas');
        if (tool === 'eraser') {
          canvasEl.style.cursor = 'cell';
        } else {
          canvasEl.style.cursor = 'crosshair';
        }
      });
    });
  }

  function togglePanel(panelClass) {
    const panel = $('.' + panelClass);
    if (!panel) return;
    const isVisible = panel.classList.contains('visible');
    closeAllPanels();
    if (!isVisible) {
      panel.classList.add('visible');
    }
  }

  function closeAllPanels() {
    $$('.color-panel, .size-panel').forEach(p => p.classList.remove('visible'));
  }

  // ── Colors ──

  function buildColorPresets() {
    const container = $('.color-presets');
    if (!container) return;

    COLOR_PRESETS.forEach(color => {
      const div = document.createElement('div');
      div.className = 'color-preset' + (color === currentColor ? ' active' : '');
      div.style.backgroundColor = color;
      div.addEventListener('click', () => {
        selectColor(color);
        $$('.color-preset').forEach(p => p.classList.remove('active'));
        div.classList.add('active');
      });
      container.appendChild(div);
    });

    const customPicker = $('#customColorPicker');
    if (customPicker) {
      customPicker.addEventListener('input', (e) => {
        selectColor(e.target.value);
        $$('.color-preset').forEach(p => p.classList.remove('active'));
      });
    }
  }

  function selectColor(color) {
    currentColor = color;
    if (canvas) canvas.setColor(color);

    // Update color indicator on toolbar
    const colorIndicator = $('.color-indicator');
    if (colorIndicator) colorIndicator.style.backgroundColor = color;
  }

  // ── Size Slider ──

  function setupSizeSlider() {
    const slider = $('#sizeSlider');
    const sizeDot = $('.size-dot');
    const sizeLabel = $('.size-label');

    if (!slider) return;

    const updateSize = () => {
      currentSize = parseInt(slider.value);
      if (canvas) canvas.setSize(currentSize);
      if (sizeDot) {
        const dotSize = Math.max(4, Math.min(40, currentSize));
        sizeDot.style.width = dotSize + 'px';
        sizeDot.style.height = dotSize + 'px';
      }
      if (sizeLabel) sizeLabel.textContent = currentSize + 'px';
    };

    slider.addEventListener('input', updateSize);
    updateSize();
  }

  // ── Zoom Controls ──

  function setupZoomControls() {
    const zoomIn = $('#zoomInBtn');
    const zoomOut = $('#zoomOutBtn');
    const zoomLevel = $('.zoom-level');

    if (zoomIn) {
      zoomIn.addEventListener('click', () => { if (canvas) canvas.zoomIn(); });
    }
    if (zoomOut) {
      zoomOut.addEventListener('click', () => { if (canvas) canvas.zoomOut(); });
    }
    if (zoomLevel) {
      zoomLevel.addEventListener('click', () => { if (canvas) canvas.resetZoom(); });
    }
  }

  // ── Room ID Display ──

  function updateRoomIdDisplay(roomId) {
    const el = $('.room-code');
    if (el) el.textContent = roomId;

    const container = $('.room-id-display');
    if (container) {
      container.addEventListener('click', () => {
        navigator.clipboard.writeText(roomId).then(() => {
          showToast('Room ID copied!');
        }).catch(() => {
          // Fallback
          showToast('Room ID: ' + roomId);
        });
      });
    }
  }

  // ── Users Panel ──

  function updateUsersPanel() {
    const container = $('.users-list');
    if (!container) return;

    container.innerHTML = '';

    // Self
    const selfEl = document.createElement('div');
    selfEl.className = 'user-item is-you';
    selfEl.innerHTML = `
      <div class="user-dot" style="background: ${network?.userColor || '#6c5ce7'}"></div>
      <span class="user-name">${network?.username || 'You'}</span>
    `;
    container.appendChild(selfEl);

    // Peers
    if (network) {
      for (const peer of network.getPeers()) {
        const el = document.createElement('div');
        el.className = 'user-item';
        el.innerHTML = `
          <div class="user-dot" style="background: ${peer.color}"></div>
          <span class="user-name">${peer.username}</span>
        `;
        container.appendChild(el);
      }
    }

    // Update peer count
    const countEl = $('.peer-count-text');
    if (countEl) {
      const total = 1 + (network?.getPeerCount() || 0);
      countEl.textContent = total + ' online';
    }
  }

  // ── Remote Cursors ──

  function updateRemoteCursor(peerId, worldX, worldY, name, color) {
    if (!canvas) return;

    const screen = canvas.worldToScreen(worldX, worldY);
    let cursorEl = remoteCursors.get(peerId);

    if (!cursorEl) {
      cursorEl = document.createElement('div');
      cursorEl.className = 'remote-cursor';
      cursorEl.innerHTML = `
        <svg viewBox="0 0 24 24" fill="${color}">
          <path d="M5.65 2.05L20.2 11.8c.45.3.45.95-.02 1.22l-5.2 2.9-2.9 5.2c-.27.47-.92.47-1.22.02L2.05 5.65c-.35-.55.15-1.2.75-1.05l2.85.45z"/>
        </svg>
        <div class="remote-cursor-label" style="background: ${color}">${name}</div>
      `;
      document.body.appendChild(cursorEl);
      remoteCursors.set(peerId, cursorEl);
    }

    cursorEl.style.left = screen.x + 'px';
    cursorEl.style.top = screen.y + 'px';
  }

  function removeRemoteCursor(peerId) {
    const el = remoteCursors.get(peerId);
    if (el) {
      el.remove();
      remoteCursors.delete(peerId);
    }
  }

  // ── Toast Notifications ──

  function showToast(message, duration = 3000) {
    const container = $('.toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ── Helpers ──

  function shakeElement(el) {
    el.style.animation = 'none';
    el.offsetHeight; // trigger reflow
    el.style.animation = 'shake 0.4s ease';
    setTimeout(() => { el.style.animation = ''; }, 400);
  }

  // Add shake keyframe
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-8px); }
      50% { transform: translateX(8px); }
      75% { transform: translateX(-4px); }
    }
  `;
  document.head.appendChild(style);

  // Close panels when clicking on canvas
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.color-panel') && !e.target.closest('.size-panel') && !e.target.closest('.toolbar')) {
      closeAllPanels();
    }
  });

})();
