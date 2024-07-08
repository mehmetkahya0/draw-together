// JavaScript to make the controls container draggable
const controlsContainer = document.getElementById('controlsContainer');

let isDragging = false;
let dragStartX, dragStartY;

const dragStart = (e) => {
  isDragging = true;
  // Use touch events if they exist, otherwise use mouse events
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  dragStartX = clientX - controlsContainer.offsetLeft;
  dragStartY = clientY - controlsContainer.offsetTop;
  document.addEventListener('mousemove', dragMove);
  document.addEventListener('mouseup', dragEnd);
  // Add touch event listeners
  document.addEventListener('touchmove', dragMove, { passive: false });
  document.addEventListener('touchend', dragEnd);
};

const dragMove = (e) => {
  if (isDragging) {
    e.preventDefault(); // Prevent scrolling when dragging on touch devices
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const newX = clientX - dragStartX;
    const newY = clientY - dragStartY;
    controlsContainer.style.left = `${newX}px`;
    controlsContainer.style.top = `${newY}px`;
  }
};

const dragEnd = () => {
  isDragging = false;
  document.removeEventListener('mousemove', dragMove);
  document.removeEventListener('mouseup', dragEnd);
  // Remove touch event listeners
  document.removeEventListener('touchmove', dragMove);
  document.removeEventListener('touchend', dragEnd);
};

// Add both mouse and touch event listeners for starting the drag
controlsContainer.addEventListener('mousedown', dragStart);
controlsContainer.addEventListener('touchstart', dragStart, { passive: false });