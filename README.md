# 🎨 Draw Together — Infinite Canvas

A **real-time collaborative drawing app** with an infinite canvas. Built with pure HTML/CSS/JS and PeerJS (WebRTC). Hosted entirely on **GitHub Pages** — no backend server needed.

<p align="center">
  <strong>🔗 <a href="https://mehmetkahya0.github.io/draw-together/">Live Demo</a></strong>
</p>

---

## ✨ Features

| Feature | Description |
|---|---|
| **Infinite Canvas** | Pan and zoom with no boundaries |
| **Real-time P2P** | Drawing syncs directly between browsers via WebRTC |
| **Room System** | Create a room & share the ID — no accounts needed |
| **Drawing Tools** | Pen, eraser, 20 color presets + custom picker, adjustable brush size |
| **Cursor Sharing** | See collaborators' cursors with names |
| **Zero Cost** | Runs on GitHub Pages, free forever |
| **Mobile Friendly** | Touch drawing and pinch-to-zoom support |

## 🚀 How to Use

1. **Open the app** → [Live Demo](https://mehmetkahya0.github.io/draw-together/)
2. **Enter your name** and click **Create Room**
3. **Share the Room ID** with friends
4. They enter the Room ID and click **Join Room**
5. **Draw together** on the infinite canvas! 🎉

## 🛠️ Controls

| Action | Desktop | Mobile |
|---|---|---|
| Draw | Left-click + drag | Touch + drag |
| Pan | Middle-click drag / Space + drag | Two-finger drag |
| Zoom | Scroll wheel | Pinch gesture |

## 📐 Tech Stack

- **Canvas API** — 2D rendering with world-coordinate transforms
- **PeerJS** (WebRTC) — peer-to-peer data channels, no server
- **GitHub Pages** — static hosting

## ⚠️ Limitations

- Drawings are **not persisted** — lost when all users disconnect
- PeerJS cloud signaling server is used for initial connection brokering
- Recommended max **~10-15 users** per room
- Room creator must stay connected (host role)

## 🏗️ Run Locally

```bash
# Any static file server works, for example:
npx serve .
# Then open http://localhost:3000
```

## 📄 License

MIT — Created by **Mehmet Kahya** © 2024-2026
