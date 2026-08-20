'use strict';

/* ============================================================
 * Murdoku · mapa digital
 * Asistente en 4 pasos: tamaño → habitaciones → muebles → resolver.
 * ============================================================ */

const STORAGE_KEY = 'murdoku-state-v3';
const MIN_SIZE = 3;
const MAX_SIZE = 15;

const ROOM_PALETTE = ['#8ec9e8', '#c5aee8', '#f5a8c0', '#ffcc80', '#a5d6a7', '#fff59d', '#ffab91', '#b0bec5', '#e6ee9c'];
const CHAR_PALETTE = ['#a1887f', '#f9a825', '#ad1457', '#78909c', '#7e57c2', '#ec407a', '#5d4037', '#00897b', '#8e24aa', '#039be5', '#7cb342', '#6d4c41', '#00acc1', '#f4511e'];
const VICTIM_COLOR = '#37474f';

// 'obstaculo', 'cama' y 'alfombra' se dibujan aparte (ver renderBoard);
// aquí solo van los muebles con un simple icono centrado.
const FURNITURE = {
  silla: { icon: '🪑' },
};

const key = (r, c) => `${r},${c}`;

/**
 * Letras de los personajes: A, B, C… y la víctima siempre V.
 * El máximo de personajes que caben sin repetir fila ni columna es el
 * lado más corto del mapa (filas × columnas no tienen por qué coincidir).
 */
function charCount() {
  return Math.min(state.rows, state.cols);
}

function charactersFor(count) {
  const letters = [];
  for (let i = 0; i < count - 1; i++) letters.push(String.fromCharCode(65 + i));
  letters.push('V');
  return letters;
}

function charColor(letter, index) {
  return letter === 'V' ? VICTIM_COLOR : CHAR_PALETTE[index % CHAR_PALETTE.length];
}

/* ------------------------------------------------------------
 * Puzle de ejemplo: el mapa de la foto del libro (9×9).
 * ------------------------------------------------------------ */
function exampleState() {
  const rooms = [
    { id: 'bano',       name: 'Baño',                color: '#8ec9e8' },
    { id: 'cocina',     name: 'Cocina',              color: '#c5aee8' },
    { id: 'invitados',  name: 'Cuarto de invitados', color: '#f5a8c0' },
    { id: 'comedor',    name: 'Comedor',             color: '#ffcc80' },
    { id: 'dormitorio', name: 'Dormitorio',          color: '#a5d6a7' },
    { id: 'salon',      name: 'Salón',               color: '#fff59d' },
  ];

  const cellRoom = {};
  const assign = (roomId, r1, r2, c1, c2) => {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) cellRoom[key(r, c)] = roomId;
  };
  assign('bano', 0, 3, 0, 1);
  assign('cocina', 0, 3, 2, 4);
  assign('invitados', 0, 2, 5, 8);
  assign('comedor', 3, 3, 5, 8);
  assign('comedor', 4, 5, 4, 8);
  assign('dormitorio', 4, 8, 0, 3);
  assign('salon', 6, 8, 4, 8);

  const furniture = {};
  const put = (type, ...cells) => cells.forEach(([r, c]) => { furniture[key(r, c)] = type; });
  // Baño
  put('obstaculo', [0, 1], [2, 0]);
  put('silla', [3, 0]);
  // Cocina
  put('obstaculo', [0, 2], [1, 2], [1, 4], [2, 4], [3, 4], [3, 3]);
  // Cuarto de invitados
  put('obstaculo', [0, 5], [2, 5], [2, 7]);
  put('cama', [0, 6], [1, 6], [0, 7], [1, 7]);
  // Comedor
  put('silla', [3, 5], [4, 4], [5, 5], [5, 8]);
  put('obstaculo', [3, 8], [4, 5], [4, 6], [4, 7], [4, 8]);
  // Dormitorio
  put('cama', [5, 1], [6, 1], [5, 2], [6, 2]);
  put('obstaculo', [7, 0], [7, 3], [8, 1], [8, 3]);
  // Salón
  put('obstaculo', [6, 4], [6, 5], [6, 6], [7, 4]);
  put('silla', [7, 8], [8, 5], [8, 6], [8, 8]);

  const windows = {
    [key(1, 8)]: ['e'],
    [key(4, 8)]: ['e'],
    [key(6, 8)]: ['e'],
    [key(5, 0)]: ['w'],
    [key(8, 0)]: ['w'],
  };

  return {
    rows: 9,
    cols: 9,
    rooms,
    cellRoom,
    furniture,
    windows,          // "r,c" -> ["n"|"s"|"e"|"w", ...]
    placements: {},   // "r,c" -> letra (colocación confirmada, una por letra)
    candidates: {},   // letra -> ["r,c", ...] (casillas donde "quizá" esté, varias por letra)
    manualX: [],      // ["r,c", ...]
    answer: '',
    step: 4,
    timerSeconds: 0,  // tiempo jugado en el paso de resolver
  };
}

function blankState() {
  return {
    rows: 9,
    cols: 9,
    rooms: [],
    cellRoom: {},
    furniture: {},
    windows: {},
    placements: {},
    candidates: {},
    manualX: [],
    answer: '',
    step: 1,
    timerSeconds: 0,
  };
}

/* ------------------------------------------------------------
 * Estado y persistencia
 * ------------------------------------------------------------ */
let state = loadState();
let selectedChar = null;
let xToolActive = false;
let candidateToolActive = false;
let selectedRoomId = state.rooms[0] ? state.rooms[0].id : null;
let furnTool = 'obstaculo';
let painting = false;

/* ------------------------------------------------------------
 * Deshacer: pila de instantáneas tomadas justo antes de cada cambio real.
 * ------------------------------------------------------------ */
const UNDO_LIMIT = 50;
const undoStack = [];
let strokeUndoPushed = false; // evita apilar una vez por casilla al pintar arrastrando

function updateUndoButton() {
  const btn = $('#btn-undo');
  if (btn) btn.disabled = undoStack.length === 0;
}

function pushUndo() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  updateUndoButton();
}

/** Como pushUndo(), pero como mucho una vez por trazo de arrastre (pointerdown→pointerup). */
function pushUndoOnce() {
  if (strokeUndoPushed) return;
  pushUndo();
  strokeUndoPushed = true;
}

function undo() {
  if (!undoStack.length) return;
  state = JSON.parse(undoStack.pop());
  saveState();
  renderAll();
  updateUndoButton();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s.rows === 'number' && typeof s.cols === 'number' && Array.isArray(s.rooms)) {
        return { ...blankState(), ...s };
      }
    }
  } catch (e) { /* estado corrupto o almacenamiento no disponible */ }
  return exampleState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { /* sin persistencia */ }
}

/* ------------------------------------------------------------
 * Utilidades
 * ------------------------------------------------------------ */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/** confirm() propio basado en <dialog> (los nativos no funcionan en visores embebidos). */
function askConfirm(message) {
  return new Promise((resolve) => {
    const dlg = $('#dlg-confirm');
    $('#dlg-confirm-msg').textContent = message;
    dlg.returnValue = 'cancel';
    dlg.onclose = () => resolve(dlg.returnValue === 'ok');
    $('#dlg-confirm-cancel').onclick = () => dlg.close('cancel');
    dlg.showModal();
  });
}

/** prompt() propio: devuelve el texto o null si se cancela. */
function askText(message, value = '') {
  return new Promise((resolve) => {
    const dlg = $('#dlg-text');
    $('#dlg-text-label').textContent = message;
    const input = $('#dlg-text-input');
    input.value = value;
    dlg.returnValue = 'cancel';
    dlg.onclose = () => resolve(dlg.returnValue === 'ok' ? input.value : null);
    $('#dlg-text-cancel').onclick = () => dlg.close('cancel');
    dlg.showModal();
    input.focus();
    input.select();
  });
}

function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(240, 235, 238, ${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function roomOf(r, c) {
  return state.cellRoom[key(r, c)] || null;
}

function isObstacle(r, c) {
  return state.furniture[key(r, c)] === 'obstaculo';
}

/** Vecina válida para fusionar muebles: mismo tipo, dentro del mapa y sin pared entre medias. */
function furnitureNeighbor(r, c, dr, dc, type) {
  const nr = r + dr, nc = c + dc;
  if (nr < 0 || nc < 0 || nr >= state.rows || nc >= state.cols) return false;
  if (roomOf(r, c) !== roomOf(nr, nc)) return false;
  return state.furniture[key(nr, nc)] === type;
}

/**
 * Empareja casillas contiguas del mismo mueble "de dos casillas" (camas) para
 * dibujarlas como una sola pieza. Recorre en orden de fila/columna y empareja
 * cada casilla libre con su vecina al este o, si no, al sur; lo que quede
 * suelto se dibuja como pieza única.
 */
function computeBedPairs() {
  const roles = {}; // "r,c" -> { role: 'head'|'foot'|'single', orientation: 'h'|'v' }
  const claimed = new Set();
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const k = key(r, c);
      if (state.furniture[k] !== 'cama' || claimed.has(k)) continue;
      const eastKey = key(r, c + 1);
      const southKey = key(r + 1, c);
      if (furnitureNeighbor(r, c, 0, 1, 'cama') && !claimed.has(eastKey)) {
        roles[k] = { role: 'head', orientation: 'h' };
        roles[eastKey] = { role: 'foot', orientation: 'h' };
        claimed.add(k); claimed.add(eastKey);
      } else if (furnitureNeighbor(r, c, 1, 0, 'cama') && !claimed.has(southKey)) {
        roles[k] = { role: 'head', orientation: 'v' };
        roles[southKey] = { role: 'foot', orientation: 'v' };
        claimed.add(k); claimed.add(southKey);
      } else {
        roles[k] = { role: 'single', orientation: 'h' };
        claimed.add(k);
      }
    }
  }
  return roles;
}

function toggleWindow(k, side) {
  const arr = state.windows[k] || [];
  const idx = arr.indexOf(side);
  if (idx >= 0) arr.splice(idx, 1); else arr.push(side);
  if (arr.length) state.windows[k] = arr; else delete state.windows[k];
}

/** Lado de la casilla más cercano a un punto de pantalla (para colocar ventanas). */
function nearestSide(rect, x, y) {
  const relX = x - rect.left, relY = y - rect.top;
  const dists = { n: relY, s: rect.height - relY, w: relX, e: rect.width - relX };
  return Object.entries(dists).sort((a, b) => a[1] - b[1])[0][0];
}

/** Casillas tachadas automáticamente por las filas/columnas de los colocados. */
function computeAutoX() {
  const auto = new Set();
  for (const [k, letter] of Object.entries(state.placements)) {
    if (!letter) continue;
    const [r, c] = k.split(',').map(Number);
    for (let cc = 0; cc < state.cols; cc++) if (cc !== c) auto.add(key(r, cc));
    for (let rr = 0; rr < state.rows; rr++) if (rr !== r) auto.add(key(rr, c));
  }
  return auto;
}

/** Colocaciones en conflicto (misma fila o columna que otra letra, o sobre un obstáculo). */
function computeConflicts() {
  const conflicts = new Set();
  const entries = Object.entries(state.placements).filter(([, v]) => v);
  for (let i = 0; i < entries.length; i++) {
    const [r1, c1] = entries[i][0].split(',').map(Number);
    for (let j = i + 1; j < entries.length; j++) {
      const [r2, c2] = entries[j][0].split(',').map(Number);
      if (r1 === r2 || c1 === c2) {
        conflicts.add(entries[i][0]);
        conflicts.add(entries[j][0]);
      }
    }
    if (isObstacle(r1, c1)) conflicts.add(entries[i][0]);
  }
  return conflicts;
}

function placementCellOf(letter) {
  for (const [k, v] of Object.entries(state.placements)) if (v === letter) return k;
  return null;
}

/** Letras marcadas como "quizá aquí" en una casilla dada. */
function candidatesAt(k) {
  const letters = [];
  for (const [letter, cells] of Object.entries(state.candidates)) if (cells.includes(k)) letters.push(letter);
  return letters;
}

function toggleCandidate(letter, k) {
  const cells = state.candidates[letter] || [];
  const idx = cells.indexOf(k);
  if (idx >= 0) cells.splice(idx, 1); else cells.push(k);
  if (cells.length) state.candidates[letter] = cells; else delete state.candidates[letter];
}

/**
 * Al confirmar una letra en una casilla, deja de tener sentido como "quizá" en
 * cualquier sitio para ella, y para las demás letras deja de tener sentido en
 * esa misma fila o columna (igual que el tachado automático).
 */
function resolveCandidatesFor(letter, k) {
  delete state.candidates[letter];
  const [r, c] = k.split(',').map(Number);
  for (const other of Object.keys(state.candidates)) {
    const remaining = state.candidates[other].filter((ck) => {
      const [rr, cc] = ck.split(',').map(Number);
      return rr !== r && cc !== c;
    });
    if (remaining.length) state.candidates[other] = remaining; else delete state.candidates[other];
  }
}

/** Quita cualquier "quizá" marcado en una casilla concreta (p. ej. al tacharla a mano). */
function clearCandidatesAt(k) {
  for (const letter of Object.keys(state.candidates)) {
    const idx = state.candidates[letter].indexOf(k);
    if (idx < 0) continue;
    state.candidates[letter].splice(idx, 1);
    if (!state.candidates[letter].length) delete state.candidates[letter];
  }
}

/* ------------------------------------------------------------
 * Render del tablero
 * ------------------------------------------------------------ */
function labelCells() {
  const byRoom = {};
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const id = roomOf(r, c);
      if (!id) continue;
      (byRoom[id] = byRoom[id] || []).push([r, c]);
    }
  }
  const labels = {};
  for (const [id, cells] of Object.entries(byRoom)) {
    const maxRow = Math.max(...cells.map(([r]) => r));
    const rowCells = cells.filter(([r]) => r === maxRow).map(([, c]) => c).sort((a, b) => a - b);
    const midCol = rowCells[Math.floor((rowCells.length - 1) / 2)];
    labels[key(maxRow, midCol)] = id;
  }
  return labels;
}

function renderCoordHeaders() {
  const colHeaders = $('#col-headers');
  const rowHeaders = $('#row-headers');
  colHeaders.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;
  rowHeaders.style.gridTemplateRows = `repeat(${state.rows}, 1fr)`;
  colHeaders.innerHTML = '';
  rowHeaders.innerHTML = '';
  for (let c = 0; c < state.cols; c++) {
    const lab = document.createElement('div');
    lab.className = 'coord-label';
    lab.textContent = c + 1;
    colHeaders.appendChild(lab);
  }
  for (let r = 0; r < state.rows; r++) {
    const lab = document.createElement('div');
    lab.className = 'coord-label';
    lab.textContent = r + 1;
    rowHeaders.appendChild(lab);
  }
}

function renderBoard() {
  renderCoordHeaders();
  const board = $('#board');
  const playMode = state.step === 4;
  board.innerHTML = '';
  board.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;

  const autoX = playMode ? computeAutoX() : new Set();
  const conflicts = playMode ? computeConflicts() : new Set();
  const manualX = new Set(state.manualX);
  const labels = labelCells();
  const roomById = Object.fromEntries(state.rooms.map((r) => [r.id, r]));
  const letters = charactersFor(charCount());
  const bedRoles = computeBedPairs();

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const k = key(r, c);
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;

      const roomId = roomOf(r, c);
      if (roomId && roomById[roomId]) {
        cell.style.backgroundColor = hexToRgba(roomById[roomId].color, 0.45);
      } else {
        cell.classList.add('no-room');
      }

      // Paredes gruesas donde cambia la habitación o se acaba el mapa.
      const sides = { n: [r - 1, c], s: [r + 1, c], w: [r, c - 1], e: [r, c + 1] };
      for (const [side, [nr, nc]] of Object.entries(sides)) {
        const out = nr < 0 || nc < 0 || nr >= state.rows || nc >= state.cols;
        if (out || roomOf(nr, nc) !== roomId) {
          const wall = document.createElement('div');
          wall.className = `wall ${side}`;
          cell.appendChild(wall);
        }
      }

      // Ventanas
      for (const side of state.windows[k] || []) {
        const w = document.createElement('div');
        w.className = `window ${side}`;
        cell.appendChild(w);
      }

      // Mueble
      const furn = state.furniture[k];
      if (furn === 'obstaculo') {
        cell.classList.add('obstacle');
        const x = document.createElement('span');
        x.className = 'xmark obstacle-x';
        x.textContent = '✕';
        cell.appendChild(x);
      } else if (furn === 'cama') {
        const { role, orientation } = bedRoles[k];
        const bed = document.createElement('div');
        bed.className = `bed bed-${role}${role !== 'single' ? `-${orientation}` : ''}`;
        if (role !== 'foot') {
          const pillow = document.createElement('div');
          pillow.className = `pillow pillow-${orientation}`;
          bed.appendChild(pillow);
        }
        cell.appendChild(bed);
      } else if (furn === 'alfombra') {
        const n = furnitureNeighbor(r, c, -1, 0, 'alfombra');
        const s = furnitureNeighbor(r, c, 1, 0, 'alfombra');
        const w2 = furnitureNeighbor(r, c, 0, -1, 'alfombra');
        const e = furnitureNeighbor(r, c, 0, 1, 'alfombra');
        const rug = document.createElement('div');
        rug.className = 'rug'
          + (n ? ' rug-n' : '') + (s ? ' rug-s' : '')
          + (w2 ? ' rug-w' : '') + (e ? ' rug-e' : '');
        rug.style.borderTopLeftRadius = (!n && !w2) ? '7px' : '0';
        rug.style.borderTopRightRadius = (!n && !e) ? '7px' : '0';
        rug.style.borderBottomLeftRadius = (!s && !w2) ? '7px' : '0';
        rug.style.borderBottomRightRadius = (!s && !e) ? '7px' : '0';
        cell.appendChild(rug);
      } else if (furn && FURNITURE[furn]) {
        const span = document.createElement('span');
        span.className = 'furn';
        span.textContent = FURNITURE[furn].icon;
        cell.appendChild(span);
      }

      if (playMode) {
        const letter = state.placements[k];
        const cands = letter ? [] : candidatesAt(k);
        if (letter && letters.includes(letter)) {
          const token = document.createElement('div');
          token.className = 'token' + (conflicts.has(k) ? ' conflict' : '');
          token.style.background = charColor(letter, letters.indexOf(letter));
          token.textContent = letter;
          cell.appendChild(token);
          cell.classList.add('has-token');
        } else if (cands.length) {
          cell.classList.add('has-candidates');
          const wrap = document.createElement('div');
          wrap.className = 'candidates';
          for (const cl of cands) {
            const badge = document.createElement('span');
            badge.className = 'candidate-badge';
            badge.style.background = charColor(cl, letters.indexOf(cl));
            badge.textContent = cl;
            wrap.appendChild(badge);
          }
          cell.appendChild(wrap);
        } else if (manualX.has(k)) {
          const x = document.createElement('span');
          x.className = 'xmark manual';
          x.textContent = '✕';
          cell.appendChild(x);
        } else if (autoX.has(k) && furn !== 'obstaculo') {
          const x = document.createElement('span');
          x.className = 'xmark auto';
          x.textContent = '✕';
          cell.appendChild(x);
        }
      }

      // Etiqueta de habitación
      if (labels[k] && roomById[labels[k]]) {
        const lab = document.createElement('div');
        lab.className = 'room-label';
        lab.textContent = roomById[labels[k]].name;
        cell.appendChild(lab);
      }

      board.appendChild(cell);
    }
  }
}

/* ------------------------------------------------------------
 * Render de paneles
 * ------------------------------------------------------------ */
function renderStepper() {
  $$('.step-btn').forEach((btn) => {
    btn.classList.toggle('active', +btn.dataset.step === state.step);
  });
  for (let i = 1; i <= 4; i++) $(`#step-${i}`).hidden = state.step !== i;
  $('#btn-prev').disabled = state.step === 1;
  $('#btn-next').disabled = state.step === 4;
}

function renderSizeStep() {
  $('#rows-value').textContent = state.rows;
  $('#cols-value').textContent = state.cols;
  $('#char-preview').textContent = 'Personajes: ' + charactersFor(charCount()).join(' ');
}

function renderRoomList() {
  const wrap = $('#room-list');
  wrap.innerHTML = '';
  if (!state.rooms.some((r) => r.id === selectedRoomId)) {
    selectedRoomId = state.rooms[0] ? state.rooms[0].id : null;
  }
  for (const room of state.rooms) {
    const row = document.createElement('div');
    row.className = 'room-row' + (selectedRoomId === room.id ? ' selected' : '');
    row.addEventListener('click', () => { selectedRoomId = room.id; renderRoomList(); });

    const color = document.createElement('input');
    color.type = 'color';
    color.value = room.color;
    let colorStrokeStarted = false;
    color.addEventListener('click', (e) => { e.stopPropagation(); colorStrokeStarted = false; });
    color.addEventListener('input', () => {
      if (!colorStrokeStarted) { pushUndo(); colorStrokeStarted = true; }
      room.color = color.value; saveState(); renderBoard();
    });

    const name = document.createElement('span');
    name.className = 'room-name';
    name.textContent = room.name;

    const rename = document.createElement('button');
    rename.textContent = '✎';
    rename.title = 'Renombrar';
    rename.addEventListener('click', async (e) => {
      e.stopPropagation();
      const n = await askText('Nombre de la habitación:', room.name);
      if (n && n.trim()) { pushUndo(); room.name = n.trim(); saveState(); renderRoomList(); renderBoard(); }
    });

    const del = document.createElement('button');
    del.textContent = '🗑';
    del.title = 'Eliminar habitación';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!(await askConfirm(`¿Eliminar «${room.name}»?`))) return;
      pushUndo();
      state.rooms = state.rooms.filter((r) => r.id !== room.id);
      for (const [k, v] of Object.entries(state.cellRoom)) if (v === room.id) delete state.cellRoom[k];
      saveState(); renderRoomList(); renderBoard();
    });

    row.append(color, name, rename, del);
    wrap.appendChild(row);
  }
}

function renderFurnTools() {
  $$('#furn-tools .tool-chip').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.furn === furnTool);
  });
}

function renderCharChips() {
  const wrap = $('#char-chips');
  wrap.innerHTML = '';
  const letters = charactersFor(charCount());
  letters.forEach((letter, i) => {
    const placed = placementCellOf(letter);
    const candCount = (state.candidates[letter] || []).length;
    const chip = document.createElement('button');
    chip.className = 'chip'
      + (selectedChar === letter ? ' selected' : '')
      + (placed ? ' placed' : '');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = charColor(letter, i);
    dot.textContent = letter;
    chip.appendChild(dot);
    if (letter === 'V') chip.appendChild(document.createTextNode('☠'));
    if (placed) chip.appendChild(document.createTextNode('✔'));
    else if (candCount) {
      const badge = document.createElement('span');
      badge.className = 'cand-count';
      badge.textContent = `✏️${candCount}`;
      chip.appendChild(badge);
    }
    chip.title = letter === 'V' ? 'Víctima' : `Personaje ${letter}`;
    chip.addEventListener('click', () => {
      selectedChar = selectedChar === letter ? null : letter;
      xToolActive = false;
      renderCharChips();
      renderPlayStatus();
    });
    wrap.appendChild(chip);
  });
  $('#btn-xtool').classList.toggle('selected', xToolActive);
  $('#btn-candidate-tool').classList.toggle('selected', candidateToolActive);
}

let wasSolved = false;
let timerInterval = null;

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function renderTimer() {
  const el = $('#timer');
  if (!el) return;
  el.textContent = `⏱️ ${formatTime(state.timerSeconds)}`;
  el.classList.toggle('done', wasSolved);
}

/** El cronómetro corre mientras se está resolviendo (paso 4) y el mapa no esté ya resuelto. */
function updateTimerRunState() {
  const shouldRun = state.step === 4 && !wasSolved;
  if (shouldRun && !timerInterval) {
    timerInterval = setInterval(() => {
      state.timerSeconds++;
      saveState();
      renderTimer();
    }, 1000);
  } else if (!shouldRun && timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  renderTimer();
}

function renderPlayStatus() {
  const el = $('#play-status');
  const letters = charactersFor(charCount());
  const placed = Object.values(state.placements).filter((v) => letters.includes(v)).length;
  const conflicts = computeConflicts();
  const solved = conflicts.size === 0 && placed === letters.length && letters.length > 0;
  if (conflicts.size > 0) {
    el.className = 'status bad';
    el.textContent = `⚠️ Hay ${conflicts.size} casillas en conflicto (misma fila/columna o sobre un obstáculo).`;
  } else if (solved) {
    el.className = 'status ok';
    el.textContent = '🎉 ¡Todos colocados y sin conflictos!';
  } else {
    const candCells = new Set(Object.values(state.candidates).flat()).size;
    el.className = 'status';
    el.textContent = `${placed} de ${letters.length} personajes colocados.`
      + (candCells ? ` ${candCells} casillas marcadas como «quizá».` : '');
  }
  if (solved && !wasSolved) launchConfetti();
  wasSolved = solved;
  updateTimerRunState();
}

/** Lluvia de confeti al completar el mapa. Respeta prefers-reduced-motion. */
function launchConfetti() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const colors = [...CHAR_PALETTE, VICTIM_COLOR];
  const pieces = Array.from({ length: 140 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.4,
    w: 6 + Math.random() * 5,
    h: 9 + Math.random() * 6,
    color: colors[Math.floor(Math.random() * colors.length)],
    vy: 2.5 + Math.random() * 2.5,
    vx: -1.5 + Math.random() * 3,
    rot: Math.random() * Math.PI * 2,
    vrot: -0.2 + Math.random() * 0.4,
  }));

  const durationMs = 3200;
  const start = performance.now();

  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of pieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < durationMs) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  }
  requestAnimationFrame(frame);
}

function renderAll() {
  renderStepper();
  renderSizeStep();
  renderRoomList();
  renderFurnTools();
  renderCharChips();
  renderPlayStatus();
  renderBoard();
  $('#answer-input').value = state.answer;
}

/* ------------------------------------------------------------
 * Interacción con el tablero
 * ------------------------------------------------------------ */
function flashCell(cell) {
  cell.classList.remove('flash');
  void cell.offsetWidth; // reinicia la animación
  cell.classList.add('flash');
}

function handlePlayClick(r, c, cell) {
  const k = key(r, c);
  if (xToolActive) {
    if (state.placements[k]) { flashCell(cell); return; }
    pushUndoOnce();
    const idx = state.manualX.indexOf(k);
    if (idx >= 0) {
      state.manualX.splice(idx, 1);
    } else {
      state.manualX.push(k);
      clearCandidatesAt(k);
    }
    saveState(); renderCharChips(); renderPlayStatus(); renderBoard();
    return;
  }
  if (candidateToolActive) {
    if (!selectedChar) { flashCell(cell); return; }
    if (state.placements[k]) { flashCell(cell); return; }
    if (isObstacle(r, c)) { flashCell(cell); return; }
    pushUndoOnce();
    toggleCandidate(selectedChar, k);
    saveState(); renderCharChips(); renderPlayStatus(); renderBoard();
    return;
  }
  if (selectedChar) {
    if (state.placements[k] === selectedChar) {
      pushUndoOnce();
      delete state.placements[k];
    } else {
      if (isObstacle(r, c)) { flashCell(cell); return; }
      pushUndoOnce();
      const prev = placementCellOf(selectedChar);
      if (prev) delete state.placements[prev];
      state.placements[k] = selectedChar;
      resolveCandidatesFor(selectedChar, k);
    }
    saveState(); renderCharChips(); renderPlayStatus(); renderBoard();
    return;
  }
  if (state.placements[k]) {
    pushUndoOnce();
    delete state.placements[k];
    saveState(); renderCharChips(); renderPlayStatus(); renderBoard();
  }
}

function applyEditAt(r, c) {
  const k = key(r, c);
  if (state.step === 2) {
    if (!selectedRoomId || state.cellRoom[k] === selectedRoomId) return;
    pushUndoOnce();
    state.cellRoom[k] = selectedRoomId;
  } else if (state.step === 3) {
    if (furnTool === 'ventana') {
      return; // las ventanas se colocan aparte, con el toque exacto sobre el borde
    } else if (furnTool === 'borrar') {
      if (!state.furniture[k] && !state.windows[k]) return;
      pushUndoOnce();
      delete state.furniture[k];
      delete state.windows[k];
    } else {
      if (state.furniture[k] === furnTool) return;
      pushUndoOnce();
      state.furniture[k] = furnTool;
    }
  } else {
    return;
  }
  saveState();
  renderBoard();
}

function setupBoardEvents() {
  const board = $('#board');
  let lastPaintedKey = null;

  // En touch, el navegador "captura" el puntero en la celda donde empezó el
  // toque: pointerover nunca llega a las demás celdas al arrastrar el dedo.
  // Por eso usamos pointermove + elementFromPoint, que funciona igual con
  // ratón y con dedo.
  const cellAt = (x, y) => document.elementFromPoint(x, y)?.closest('.cell') || null;

  board.addEventListener('pointerdown', (ev) => {
    const cell = cellAt(ev.clientX, ev.clientY);
    if (!cell) return;
    strokeUndoPushed = false;
    const r = +cell.dataset.r, c = +cell.dataset.c;
    if (state.step === 4) {
      handlePlayClick(r, c, cell);
    } else if (state.step === 3 && furnTool === 'ventana') {
      // Las ventanas van al borde más cercano al toque, y solo con un toque directo.
      ev.preventDefault();
      const side = nearestSide(cell.getBoundingClientRect(), ev.clientX, ev.clientY);
      pushUndoOnce();
      toggleWindow(key(r, c), side);
      saveState();
      renderBoard();
    } else {
      painting = true;
      lastPaintedKey = key(r, c);
      ev.preventDefault();
      applyEditAt(r, c);
    }
  });

  board.addEventListener('pointermove', (ev) => {
    if (!painting) return;
    ev.preventDefault();
    const cell = cellAt(ev.clientX, ev.clientY);
    if (!cell) return;
    const r = +cell.dataset.r, c = +cell.dataset.c;
    const k = key(r, c);
    if (k === lastPaintedKey) return;
    lastPaintedKey = k;
    applyEditAt(r, c);
  });

  window.addEventListener('pointerup', () => { painting = false; lastPaintedKey = null; });
}

/* ------------------------------------------------------------
 * Controles
 * ------------------------------------------------------------ */
function goToStep(step) {
  state.step = Math.max(1, Math.min(4, step));
  saveState();
  renderAll();
}

/** Recorta lo que quede fuera de la cuadrícula tras cambiar filas/columnas. */
function pruneOutOfBounds() {
  const inBounds = (k) => {
    const [r, c] = k.split(',').map(Number);
    return r < state.rows && c < state.cols;
  };
  for (const dict of [state.cellRoom, state.furniture, state.windows, state.placements]) {
    for (const k of Object.keys(dict)) if (!inBounds(k)) delete dict[k];
  }
  const letters = charactersFor(charCount());
  for (const [k, v] of Object.entries(state.placements)) if (!letters.includes(v)) delete state.placements[k];
  state.manualX = state.manualX.filter(inBounds);
  for (const letter of Object.keys(state.candidates)) {
    if (!letters.includes(letter)) { delete state.candidates[letter]; continue; }
    const cells = state.candidates[letter].filter(inBounds);
    if (cells.length) state.candidates[letter] = cells; else delete state.candidates[letter];
  }
}

function setRows(rows) {
  const r = Math.max(MIN_SIZE, Math.min(MAX_SIZE, rows));
  if (r === state.rows) return;
  pushUndo();
  state.rows = r;
  pruneOutOfBounds();
  saveState();
  renderAll();
}

function setCols(cols) {
  const c = Math.max(MIN_SIZE, Math.min(MAX_SIZE, cols));
  if (c === state.cols) return;
  pushUndo();
  state.cols = c;
  pruneOutOfBounds();
  saveState();
  renderAll();
}

function setupControls() {
  $$('.step-btn').forEach((btn) => {
    btn.addEventListener('click', () => goToStep(+btn.dataset.step));
  });
  $('#btn-prev').addEventListener('click', () => goToStep(state.step - 1));
  $('#btn-next').addEventListener('click', () => goToStep(state.step + 1));

  $('#rows-minus').addEventListener('click', () => setRows(state.rows - 1));
  $('#rows-plus').addEventListener('click', () => setRows(state.rows + 1));
  $('#cols-minus').addEventListener('click', () => setCols(state.cols - 1));
  $('#cols-plus').addEventListener('click', () => setCols(state.cols + 1));

  $('#btn-add-room').addEventListener('click', async () => {
    const name = await askText('Nombre de la habitación:');
    if (!name || !name.trim()) return;
    pushUndo();
    const room = {
      id: 'room' + Date.now(),
      name: name.trim(),
      color: ROOM_PALETTE[state.rooms.length % ROOM_PALETTE.length],
    };
    state.rooms.push(room);
    selectedRoomId = room.id;
    saveState();
    renderRoomList();
  });

  $('#btn-fill-room').addEventListener('click', async () => {
    const empty = [];
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const k = key(r, c);
        if (!state.cellRoom[k]) empty.push(k);
      }
    }
    if (!empty.length) {
      await askConfirm('No quedan casillas sin habitación para rellenar.');
      return;
    }
    const name = await askText('Nombre de la última habitación (rellenará los huecos):');
    if (!name || !name.trim()) return;
    pushUndo();
    const room = {
      id: 'room' + Date.now(),
      name: name.trim(),
      color: ROOM_PALETTE[state.rooms.length % ROOM_PALETTE.length],
    };
    state.rooms.push(room);
    for (const k of empty) state.cellRoom[k] = room.id;
    selectedRoomId = room.id;
    saveState();
    renderRoomList();
    renderBoard();
  });

  $$('#furn-tools .tool-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      furnTool = btn.dataset.furn;
      renderFurnTools();
    });
  });

  $('#btn-xtool').addEventListener('click', () => {
    xToolActive = !xToolActive;
    if (xToolActive) { selectedChar = null; candidateToolActive = false; }
    renderCharChips();
  });

  $('#btn-candidate-tool').addEventListener('click', () => {
    candidateToolActive = !candidateToolActive;
    if (candidateToolActive) xToolActive = false;
    renderCharChips();
  });

  $('#btn-clear-plays').addEventListener('click', async () => {
    if (!(await askConfirm('¿Quitar todos los personajes y tachaduras manuales?'))) return;
    pushUndo();
    state.placements = {};
    state.manualX = [];
    saveState();
    renderCharChips(); renderPlayStatus(); renderBoard();
  });

  $('#btn-clear-candidates').addEventListener('click', async () => {
    if (!(await askConfirm('¿Quitar todas las casillas marcadas como «quizá»?'))) return;
    pushUndo();
    state.candidates = {};
    saveState();
    renderCharChips(); renderPlayStatus(); renderBoard();
  });

  $('#btn-new').addEventListener('click', async () => {
    if (!(await askConfirm('¿Empezar un mapa nuevo desde cero? Se borrará el actual.'))) return;
    pushUndo();
    state = blankState();
    selectedChar = null;
    xToolActive = false;
    candidateToolActive = false;
    selectedRoomId = null;
    furnTool = 'obstaculo';
    saveState();
    renderAll();
  });

  $('#btn-undo').addEventListener('click', undo);

  $('#answer-input').addEventListener('input', (ev) => {
    state.answer = ev.target.value;
    saveState();
  });
}

/* ------------------------------------------------------------
 * Arranque
 * ------------------------------------------------------------ */
setupControls();
setupBoardEvents();
renderAll();
updateUndoButton();
