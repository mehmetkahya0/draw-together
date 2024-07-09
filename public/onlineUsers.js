document.addEventListener("DOMContentLoaded", function () {
  const socket = io(); // Connect to the server

  // Listen for 'updateOnlineUsers' event from the server
  socket.on("updateOnlineUsers", function (users) {
    // Assuming 'users' is an array of usernames
    const usersList = users.join(", "); // Convert array to comma-separated string
    document.getElementById(
      "onlineUsers"
    ).textContent = `Online Users: ${usersList}`;
  });

  // Extract the username from the URL query parameters
  const params = new URLSearchParams(window.location.search);
  const username = params.get("username");

  // Display the username or "Guest" if not provided
  document.getElementById("usernameDisplay").textContent = username || "Guest";

  // Emit 'register' event with username to add this user to the list of online users
  socket.emit("register", username);
});
