'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// ---- Skins ----
// Cada skin define `colors` (índices 1-8, igual que PIECES), `grid` (color de la
// cuadrícula o null para usar --grid del CSS) y `drawBlock(context, px, py, color, size, alpha)`
// con coordenadas en píxeles.
function roundedRect(context, x, y, w, h, r) {
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(x, y, w, h, r);
  } else {
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }
}

const SKINS = {
  retro: {
    name: 'Retro',
    colors: [
      null,
      '#4dd0e1', // I - cyan
      '#ffd54f', // O - yellow
      '#ba68c8', // T - purple
      '#81c784', // S - green
      '#e57373', // Z - red
      '#90caf9', // J - azul pálido
      '#ffb74d', // L - orange
      '#a1887f', // Tuerca - marrón
    ],
    grid: null,
    drawBlock(context, px, py, color, size) {
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },
  neon: {
    name: 'Neon',
    colors: [
      null,
      '#00f0ff', '#fff200', '#d500f9', '#39ff14', '#ff1744', '#2979ff', '#ff9100', '#ff6e40',
    ],
    grid: '#1a1a24',
    drawBlock(context, px, py, color, size) {
      context.shadowColor = color;
      context.shadowBlur = 12;
      context.fillStyle = color;
      context.fillRect(px + 3, py + 3, size - 6, size - 6);
      context.shadowBlur = 0;
      // núcleo brillante
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.fillRect(px + 6, py + 6, size - 12, size - 12);
    },
  },
  pastel: {
    name: 'Pastel',
    colors: [
      null,
      '#a8e6ef', '#fff1b0', '#d9b8f0', '#b9eac0', '#f6b8b8', '#bcd7f7', '#ffd6a5', '#d7c4bb',
    ],
    grid: null,
    drawBlock(context, px, py, color, size) {
      context.fillStyle = color;
      roundedRect(context, px + 1.5, py + 1.5, size - 3, size - 3, size * 0.28);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.45)';
      roundedRect(context, px + 5, py + 4, size - 10, 4, 2);
      context.fill();
    },
  },
  pixel: {
    name: 'Pixel art',
    colors: [
      null,
      '#29b6d6', '#f5c518', '#9c4dcc', '#4caf50', '#d93a3a', '#3f7fd9', '#f08a1c', '#8d6e63',
    ],
    grid: null,
    drawBlock(context, px, py, color, size) {
      const n = 6; // rejilla de 6x6 "píxeles" por bloque
      const u = (size - 2) / n;
      const x0 = px + 1, y0 = py + 1;
      context.fillStyle = color;
      context.fillRect(x0, y0, n * u, n * u);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const edgeLight = i === 0 || j === 0;
          const edgeDark = i === n - 1 || j === n - 1;
          if (edgeDark) context.fillStyle = 'rgba(0,0,0,0.35)';
          else if (edgeLight) context.fillStyle = 'rgba(255,255,255,0.4)';
          else if ((i + j) % 2 === 0) context.fillStyle = 'rgba(255,255,255,0.12)';
          else context.fillStyle = 'rgba(0,0,0,0.12)';
          context.fillRect(x0 + i * u, y0 + j * u, u, u);
        }
      }
    },
  },
};

const SKIN_KEY = 'tetris.skin';
let currentSkin = 'retro';

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca (anillo 3x3 con hueco)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[currentSkin];
  context.save();
  context.globalAlpha = alpha ?? 1;
  skin.drawBlock(context, x * size, y * size, skin.colors[colorIndex], size);
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = SKINS[currentSkin].grid || getComputedStyle(document.documentElement).getPropertyValue('--grid');
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeToggle.addEventListener('click', () => {
  const light = document.documentElement.dataset.theme !== 'light';
  if (light) document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  themeToggle.setAttribute('aria-checked', String(light));
  themeToggle.textContent = light ? '☾ Modo oscuro' : '☀ Modo claro';
  themeToggle.blur(); // no robar el foco al teclado del juego
  // repintar los canvas también en pausa o game over
  draw();
  drawNext();
});

function applySkin(name) {
  currentSkin = Object.hasOwn(SKINS, name) ? name : 'retro';
  document.documentElement.dataset.skin = currentSkin;
  skinSelect.value = currentSkin;
}

function loadSkin() {
  try {
    const saved = localStorage.getItem(SKIN_KEY);
    if (Object.hasOwn(SKINS, saved)) return saved;
  } catch (e) { /* localStorage no disponible */ }
  return 'retro';
}

for (const key of Object.keys(SKINS)) {
  skinSelect.add(new Option(SKINS[key].name, key));
}
applySkin(loadSkin());

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  try { localStorage.setItem(SKIN_KEY, currentSkin); } catch (e) { /* ignorar */ }
  skinSelect.blur(); // devolver el teclado al juego
  draw();
  drawNext();
});

// evitar que las flechas cambien el select; el evento sigue burbujeando al juego
skinSelect.addEventListener('keydown', e => {
  if (e.code.startsWith('Arrow')) {
    e.preventDefault();
    skinSelect.blur();
  }
});

init();
