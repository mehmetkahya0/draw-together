const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const port = process.env.PORT || 3000;

app.use(express.static(__dirname + "/public"));

function onConnection(socket) {
  socket.on("drawing", (data) => socket.broadcast.emit("drawing", data));
}

// Initialize a function to emit the current count of connected clients
function emitClientCount() {
  // Emit the count to all clients
  io.emit("count", Object.keys(io.sockets.sockets).length);
}

io.on("connection", (socket) => {
  // Placeholder for username
  let username = "Unknown User";

  // Emit the count to all clients whenever someone connects
  emitClientCount();
  console.log("A user connected");

  // Listen for 'register' event to capture the username
  socket.on("register", (name) => {
    username = name;
    console.log(`${username} connected`);
  });

  socket.on("clear", () => {
    // Broadcast the clear event to all clients
    io.emit("clear");
    console.log("Clearing canvas");
  });
  socket.on("disconnect", () => {
    console.log(`${username} disconnected`);
    // Emit the updated count to all clients whenever someone disconnects
    emitClientCount();
    socket.broadcast.emit("userLeft", `${username} has left the chat`);
  });
});

http.listen(port, () => console.log(`listening on port ${port}`));
