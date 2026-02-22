/**
 * Draw Together — Infinite Canvas Engine
 * Handles pan, zoom, coordinate transforms, and rendering
 */

class InfiniteCanvas {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');

    // Transform state
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;
    this.minScale = 0.1;
    this.maxScale = 10;

    // Drawing state
    this.strokes = []; // Array of stroke objects
    this.currentStroke = null;

    // Pan state
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;
    this.spacePressed = false;

    // Interaction
    this.isDrawing = false;

    // Grid
    this.showGrid = true;
    this.gridSize = 50;

    // Callbacks
    this.onStrokeComplete = null;
    this.onCursorMove = null;

    this._init();
  }

  _init() {
    this._resize();
    window.addEventListener('resize', () => this._resize());

    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this._onPointerDown(e));
    window.addEventListener('mousemove', (e) => this._onPointerMove(e));
    window.addEventListener('mouseup', (e) => this._onPointerUp(e));

    // Wheel (zoom)
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });

    // Touch events
    this.canvas.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    this.canvas.addEventListener('touchend', (e) => this._onTouchEnd(e));

    // Keyboard (space for pan)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        this.spacePressed = true;
        this.canvas.style.cursor = 'grab';
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spacePressed = false;
        if (!this.isPanning) {
          this.canvas.style.cursor = 'crosshair';
        }
      }
    });

    this._render();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.ctx.scale(dpr, dpr);
    this._render();
  }

  // ── Coordinate Transforms ──

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.offsetX) / this.scale,
      y: (sy - this.offsetY) / this.scale
    };
  }

  worldToScreen(wx, wy) {
    return {
      x: wx * this.scale + this.offsetX,
      y: wy * this.scale + this.offsetY
    };
  }

  // ── Zoom ──

  zoomTo(newScale, centerX, centerY) {
    const clampedScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
    const worldBefore = this.screenToWorld(centerX, centerY);
    this.scale = clampedScale;
    const screenAfter = this.worldToScreen(worldBefore.x, worldBefore.y);
    this.offsetX += centerX - screenAfter.x;
    this.offsetY += centerY - screenAfter.y;
    this._render();
  }

  zoomIn() {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    this.zoomTo(this.scale * 1.2, cx, cy);
  }

  zoomOut() {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    this.zoomTo(this.scale / 1.2, cx, cy);
  }

  resetZoom() {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this._render();
  }

  getZoomPercent() {
    return Math.round(this.scale * 100);
  }

  // ── Pointer Handling ──

  _onPointerDown(e) {
    // Middle mouse or space+left = pan
    if (e.button === 1 || (e.button === 0 && this.spacePressed)) {
      this.isPanning = true;
      this.panStartX = e.clientX - this.offsetX;
      this.panStartY = e.clientY - this.offsetY;
      this.canvas.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    // Left mouse = draw
    if (e.button === 0 && this.currentTool) {
      this.isDrawing = true;
      const world = this.screenToWorld(e.clientX, e.clientY);
      this.currentStroke = {
        id: this._generateId(),
        tool: this.currentTool,
        color: this.currentColor || '#ffffff',
        size: this.currentSize || 3,
        points: [{ x: world.x, y: world.y }]
      };
    }
  }

  _onPointerMove(e) {
    // Broadcast cursor position
    if (this.onCursorMove) {
      const world = this.screenToWorld(e.clientX, e.clientY);
      this.onCursorMove(world.x, world.y);
    }

    if (this.isPanning) {
      this.offsetX = e.clientX - this.panStartX;
      this.offsetY = e.clientY - this.panStartY;
      this._render();
      return;
    }

    if (this.isDrawing && this.currentStroke) {
      const world = this.screenToWorld(e.clientX, e.clientY);
      this.currentStroke.points.push({ x: world.x, y: world.y });
      this._render();
    }
  }

  _onPointerUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = this.spacePressed ? 'grab' : 'crosshair';
      return;
    }

    if (this.isDrawing && this.currentStroke) {
      this.isDrawing = false;
      if (this.currentStroke.points.length > 1) {
        // If eraser, remove strokes that intersect
        if (this.currentStroke.tool === 'eraser') {
          this._eraseStrokes(this.currentStroke.points);
        } else {
          this.strokes.push(this.currentStroke);
          if (this.onStrokeComplete) {
            this.onStrokeComplete(this.currentStroke);
          }
        }
      }
      this.currentStroke = null;
      this._render();
    }
  }

  // ── Touch Handling ──

  _touchState = { lastDist: 0, lastMidX: 0, lastMidY: 0, isTwoFinger: false };

  _onTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      // Pinch zoom / two-finger pan
      this._touchState.isTwoFinger = true;
      const t1 = e.touches[0], t2 = e.touches[1];
      this._touchState.lastDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      this._touchState.lastMidX = (t1.clientX + t2.clientX) / 2;
      this._touchState.lastMidY = (t1.clientY + t2.clientY) / 2;
      // Cancel any drawing
      this.isDrawing = false;
      this.currentStroke = null;
    } else if (e.touches.length === 1) {
      this._touchState.isTwoFinger = false;
      const t = e.touches[0];
      this.isDrawing = true;
      const world = this.screenToWorld(t.clientX, t.clientY);
      this.currentStroke = {
        id: this._generateId(),
        tool: this.currentTool,
        color: this.currentColor || '#ffffff',
        size: this.currentSize || 3,
        points: [{ x: world.x, y: world.y }]
      };
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      const t1 = e.touches[0], t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      // Zoom
      const scaleChange = dist / this._touchState.lastDist;
      this.zoomTo(this.scale * scaleChange, midX, midY);

      // Pan
      this.offsetX += midX - this._touchState.lastMidX;
      this.offsetY += midY - this._touchState.lastMidY;

      this._touchState.lastDist = dist;
      this._touchState.lastMidX = midX;
      this._touchState.lastMidY = midY;
      this._render();
    } else if (e.touches.length === 1 && this.isDrawing && this.currentStroke) {
      const t = e.touches[0];
      const world = this.screenToWorld(t.clientX, t.clientY);
      this.currentStroke.points.push({ x: world.x, y: world.y });

      if (this.onCursorMove) {
        this.onCursorMove(world.x, world.y);
      }

      this._render();
    }
  }

  _onTouchEnd(e) {
    if (this._touchState.isTwoFinger && e.touches.length < 2) {
      this._touchState.isTwoFinger = false;
      return;
    }

    if (this.isDrawing && this.currentStroke) {
      this.isDrawing = false;
      if (this.currentStroke.points.length > 1) {
        if (this.currentStroke.tool === 'eraser') {
          this._eraseStrokes(this.currentStroke.points);
        } else {
          this.strokes.push(this.currentStroke);
          if (this.onStrokeComplete) {
            this.onStrokeComplete(this.currentStroke);
          }
        }
      }
      this.currentStroke = null;
      this._render();
    }
  }

  // ── Wheel ──

  _onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoomTo(this.scale * delta, e.clientX, e.clientY);
  }

  // ── Eraser ──

  _eraseStrokes(eraserPoints) {
    const eraserRadius = (this.currentSize || 10) / this.scale;
    const toRemove = new Set();

    for (const ep of eraserPoints) {
      for (let i = 0; i < this.strokes.length; i++) {
        if (toRemove.has(i)) continue;
        const s = this.strokes[i];
        for (const sp of s.points) {
          const dist = Math.hypot(sp.x - ep.x, sp.y - ep.y);
          if (dist < eraserRadius + s.size / 2) {
            toRemove.add(i);
            break;
          }
        }
      }
    }

    if (toRemove.size > 0) {
      const removedIds = [];
      const newStrokes = [];
      this.strokes.forEach((s, i) => {
        if (toRemove.has(i)) {
          removedIds.push(s.id);
        } else {
          newStrokes.push(s);
        }
      });
      this.strokes = newStrokes;

      // Broadcast erased stroke IDs
      if (this.onStrokesErased) {
        this.onStrokesErased(removedIds);
      }
    }
  }

  // ── Set Tool State ──

  setTool(tool) { this.currentTool = tool; }
  setColor(color) { this.currentColor = color; }
  setSize(size) { this.currentSize = size; }

  // ── Add Remote Stroke ──

  addStroke(stroke) {
    this.strokes.push(stroke);
    this._render();
  }

  removeStrokesById(ids) {
    const idSet = new Set(ids);
    this.strokes = this.strokes.filter(s => !idSet.has(s.id));
    this._render();
  }

  getAllStrokes() {
    return [...this.strokes];
  }

  clearAll() {
    this.strokes = [];
    this._render();
  }

  // ── Rendering ──

  _render() {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;

    ctx.clearRect(0, 0, w, h);

    // Fill canvas background from CSS variable
    const styles = getComputedStyle(document.documentElement);
    const bgColor = styles.getPropertyValue('--canvas-bg').trim() || '#060b18';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Draw grid
    if (this.showGrid) {
      this._drawGrid(ctx, w, h);
    }

    // Apply transform
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // Draw all strokes
    for (const stroke of this.strokes) {
      this._drawStroke(ctx, stroke);
    }

    // Draw current stroke
    if (this.currentStroke && this.currentStroke.tool !== 'eraser') {
      this._drawStroke(ctx, this.currentStroke);
    }

    ctx.restore();

    // Draw eraser cursor preview
    if (this.currentStroke && this.currentStroke.tool === 'eraser') {
      const pts = this.currentStroke.points;
      const last = pts[pts.length - 1];
      const screen = this.worldToScreen(last.x, last.y);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, this.currentSize / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawGrid(ctx, w, h) {
    const gridSize = this.gridSize;
    const scaledGrid = gridSize * this.scale;

    if (scaledGrid < 10) return; // Too zoomed out

    const startX = this.offsetX % scaledGrid;
    const startY = this.offsetY % scaledGrid;

    ctx.save();
    const styles = getComputedStyle(document.documentElement);
    ctx.strokeStyle = styles.getPropertyValue('--grid-color').trim() || 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = startX; x < w; x += scaledGrid) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = startY; y < h; y += scaledGrid) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawStroke(ctx, stroke) {
    if (stroke.points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Smooth curve rendering using quadratic bezier
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

    if (stroke.points.length === 2) {
      ctx.lineTo(stroke.points[1].x, stroke.points[1].y);
    } else {
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const midX = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
        const midY = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
        ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, midX, midY);
      }
      const last = stroke.points[stroke.points.length - 1];
      ctx.lineTo(last.x, last.y);
    }

    ctx.stroke();
    ctx.restore();
  }

  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }
}
