const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const port = process.env.PORT || 3000;

app.use(express.static(__dirname + "/public"));

function onConnection(socket) {
  socket.on("drawing", (data) => socket.broadcast.emit("drawing", data));
}

io.on("connection", onConnection);

// Assuming you have an existing server setup with socket.io
io.on("connection", (socket) => {
  // Placeholder for username
  let username = "Unknown User";

  // Emit the count to all clients whenever someone connects
  io.emit("count", io.engine.clientsCount);
  console.log("A user connected");

  // Listen for 'register' event to capture the username
  socket.on("register", (name) => {
    username = name;
    console.log(`${username} connected`);
  });

  socket.on("disconnect", () => {
    console.log(`${username} disconnected`);
    // Emit the updated count to all clients whenever someone disconnects
    io.emit("count", io.engine.clientsCount);
    socket.broadcast.emit("userLeft", `${username} has left the chat`);
  });
});

http.listen(port, () => console.log("listening on port " + port));