// main.js
"use strict";

(function () {
  var socket = io();
  var canvas = document.getElementsByClassName("whiteboard")[0];
  var colors = document.getElementsByClassName("color");
  var context = canvas.getContext("2d");

  var current = {
    color: "black",
    size: 2,
    mode: "normal",
  };

  var drawing = false;
  // Assuming 'socket' is already defined as in your provided code
  var statusLed = document.getElementById("statusLed");

  socket.on("connect", function () {
    statusLed.className = "status-led connected";
  });

  socket.on("disconnect", function () {
    statusLed.className = "status-led disconnected";
  });
  // Assuming 'socket' is already defined as in your provided code
  socket.on("count", function (data) {
    document.getElementById(
      "userCount"
    ).textContent = `Connected users: ${data}`;
  });

  socket.on("userLeft", function (message) {
    alert(message);
  });
  canvas.addEventListener("mousedown", onMouseDown, false);
  canvas.addEventListener("mouseup", onMouseUp, false);
  canvas.addEventListener("mouseout", onMouseUp, false);
  canvas.addEventListener("mousemove", throttle(onMouseMove, 10), false);

  // Touch support for mobile devices
  canvas.addEventListener("touchstart", onMouseDown, false);
  canvas.addEventListener("touchend", onMouseUp, false);
  canvas.addEventListener("touchcancel", onMouseUp, false);
  canvas.addEventListener("touchmove", throttle(onMouseMove, 10), false);

  for (var i = 0; i < colors.length; i++) {
    colors[i].addEventListener("click", onColorUpdate, false);
  }

  document
    .getElementById("size")
    .addEventListener("input", onSizeUpdate, false);
  document
    .getElementById("mode")
    .addEventListener("change", onModeUpdate, false);

  socket.on("drawing", onDrawingEvent);

  window.addEventListener("resize", onResize, false);
  onResize();

  function drawLine(x0, y0, x1, y1, color, size, emit) {
    context.beginPath();
    context.moveTo(x0, y0);
    context.lineTo(x1, y1);
    context.strokeStyle = color;
    context.lineWidth = size;
    context.stroke();
    context.closePath();

    if (!emit) {
      return;
    }
    var w = canvas.width;
    var h = canvas.height;

    socket.emit("drawing", {
      x0: x0 / w,
      y0: y0 / h,
      x1: x1 / w,
      y1: y1 / h,
      color: color,
      size: size,
    });
  }

  function drawSpray(x, y, color, size, emit) {
    for (var i = 0; i < 10; i++) {
      var offsetX = Math.random() * size - size / 2;
      var offsetY = Math.random() * size - size / 2;
      context.beginPath();
      context.arc(x + offsetX, y + offsetY, 1, 0, 2 * Math.PI, false);
      context.fillStyle = color;
      context.fill();
    }

    if (!emit) {
      return;
    }
    var w = canvas.width;
    var h = canvas.height;

    socket.emit("drawing", {
      x: x / w,
      y: y / h,
      color: color,
      size: size,
      mode: "spray",
    });
  }

  function erase(x0, y0, x1, y1, size, emit) {
    context.clearRect(x1 - size / 2, y1 - size / 2, size, size);

    if (!emit) {
      return;
    }
    var w = canvas.width;
    var h = canvas.height;

    socket.emit("drawing", {
      x0: x0 / w,
      y0: y0 / h,
      x1: x1 / w,
      y1: y1 / h,
      size: size,
      mode: "eraser",
    });
  }

  function onMouseDown(e) {
    drawing = true;
    current.x = e.clientX || e.touches[0].clientX;
    current.y = e.clientY || e.touches[0].clientY;
  }

  function onMouseUp(e) {
    if (!drawing) {
      return;
    }
    drawing = false;
    switch (current.mode) {
      case "spray":
        drawSpray(
          e.clientX || e.touches[0].clientX,
          e.clientY || e.touches[0].clientY,
          current.color,
          current.size,
          true
        );
        break;
      case "eraser":
        erase(
          current.x,
          current.y,
          e.clientX || e.touches[0].clientX,
          e.clientY || e.touches[0].clientY,
          current.size,
          true
        );
        break;
      default:
        drawLine(
          current.x,
          current.y,
          e.clientX || e.touches[0].clientX,
          e.clientY || e.touches[0].clientY,
          current.color,
          current.size,
          true
        );
    }
  }

  function onMouseMove(e) {
    if (!drawing) {
      return;
    }
    switch (current.mode) {
      case "spray":
        drawSpray(
          e.clientX || e.touches[0].clientX,
          e.clientY || e.touches[0].clientY,
          current.color,
          current.size,
          true
        );
        break;
      case "eraser":
        erase(
          current.x,
          current.y,
          e.clientX || e.touches[0].clientX,
          e.clientY || e.touches[0].clientY,
          current.size,
          true
        );
        break;
      default:
        drawLine(
          current.x,
          current.y,
          e.clientX || e.touches[0].clientX,
          e.clientY || e.touches[0].clientY,
          current.color,
          current.size,
          true
        );
    }
    current.x = e.clientX || e.touches[0].clientX;
    current.y = e.clientY || e.touches[0].clientY;
  }

  function onColorUpdate(e) {
    current.color = e.target.className.split(" ")[1];
  }

  function onSizeUpdate(e) {
    current.size = e.target.value;
  }

  function onModeUpdate(e) {
    current.mode = e.target.value;
  }

  function onDrawingEvent(data) {
    var w = canvas.width;
    var h = canvas.height;
    switch (data.mode) {
      case "spray":
        drawSpray(data.x * w, data.y * h, data.color, data.size);
        break;
      case "eraser":
        erase(data.x0 * w, data.y0 * h, data.x1 * w, data.y1 * h, data.size);
        break;
      default:
        drawLine(
          data.x0 * w,
          data.y0 * h,
          data.x1 * w,
          data.y1 * h,
          data.color,
          data.size
        );
    }
  }
  // Add a clear button functionality
  document.getElementById("clear").addEventListener("click", function () {
    context.clearRect(0, 0, canvas.width, canvas.height);
  });
  function onResize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function throttle(callback, delay) {
    var previousCall = new Date().getTime();
    return function () {
      var time = new Date().getTime();
      if (time - previousCall >= delay) {
        previousCall = time;
        callback.apply(null, arguments);
      }
    };
  }
})();
