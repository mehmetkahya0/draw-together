// Improved JavaScript for making the controls container draggable with added boundary checks
const controlsContainer = document.getElementById('controlsContainer');
let isDragging = false;
let dragStartX, dragStartY;

const dragStart = (e) => {
  isDragging = true;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  dragStartX = clientX - controlsContainer.offsetLeft;
  dragStartY = clientY - controlsContainer.offsetTop;
  document.addEventListener('mousemove', dragMove);
  document.addEventListener('mouseup', dragEnd);
  document.addEventListener('touchmove', dragMove, { passive: false });
  document.addEventListener('touchend', dragEnd);
};

const dragMove = (e) => {
  if (isDragging) {
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    let newX = clientX - dragStartX;
    let newY = clientY - dragStartY;

    // Boundary checks
    const maxLeft = window.innerWidth - controlsContainer.offsetWidth;
    const maxTop = window.innerHeight - controlsContainer.offsetHeight;
    newX = Math.min(Math.max(0, newX), maxLeft);
    newY = Math.min(Math.max(0, newY), maxTop);

    controlsContainer.style.left = `${newX}px`;
    controlsContainer.style.top = `${newY}px`;
  }
};

const dragEnd = () => {
  isDragging = false;
  document.removeEventListener('mousemove', dragMove);
  document.removeEventListener('mouseup', dragEnd);
  document.removeEventListener('touchmove', dragMove);
  document.removeEventListener('touchend', dragEnd);
};

controlsContainer.addEventListener('mousedown', dragStart);
controlsContainer.addEventListener('touchstart', dragStart, { passive: false });