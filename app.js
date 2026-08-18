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

const FURNITURE = {
  silla: { icon: '🪑' },
  cama: { icon: '🛏️' },
  alfombra: { icon: '🟫' },
  obstaculo: { icon: '' },
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

  return {
    rows: 9,
    cols: 9,
    rooms,
    cellRoom,
    furniture,
    placements: {},   // "r,c" -> letra
    manualX: [],      // ["r,c", ...]
    answer: '',
    step: 4,
  };
}

function blankState() {
  return {
    rows: 9,
    cols: 9,
    rooms: [],
    cellRoom: {},
    furniture: {},
    placements: {},
    manualX: [],
    answer: '',
    step: 1,
  };
}

/* ------------------------------------------------------------
 * Estado y persistencia
 * ------------------------------------------------------------ */
let state = loadState();
let selectedChar = null;
let xToolActive = false;
let selectedRoomId = state.rooms[0] ? state.rooms[0].id : null;
let furnTool = 'obstaculo';
let painting = false;

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

function renderBoard() {
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

      // Mueble
      const furn = state.furniture[k];
      if (furn === 'obstaculo') {
        cell.classList.add('obstacle');
        const x = document.createElement('span');
        x.className = 'xmark obstacle-x';
        x.textContent = '✕';
        cell.appendChild(x);
      } else if (furn && FURNITURE[furn]) {
        const span = document.createElement('span');
        span.className = 'furn';
        span.textContent = FURNITURE[furn].icon;
        cell.appendChild(span);
      }

      if (playMode) {
        const letter = state.placements[k];
        if (letter && letters.includes(letter)) {
          const token = document.createElement('div');
          token.className = 'token' + (conflicts.has(k) ? ' conflict' : '');
          token.style.background = charColor(letter, letters.indexOf(letter));
          token.textContent = letter;
          cell.appendChild(token);
          cell.classList.add('has-token');
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
    color.addEventListener('click', (e) => e.stopPropagation());
    color.addEventListener('input', () => { room.color = color.value; saveState(); renderBoard(); });

    const name = document.createElement('span');
    name.className = 'room-name';
    name.textContent = room.name;

    const rename = document.createElement('button');
    rename.textContent = '✎';
    rename.title = 'Renombrar';
    rename.addEventListener('click', async (e) => {
      e.stopPropagation();
      const n = await askText('Nombre de la habitación:', room.name);
      if (n && n.trim()) { room.name = n.trim(); saveState(); renderRoomList(); renderBoard(); }
    });

    const del = document.createElement('button');
    del.textContent = '🗑';
    del.title = 'Eliminar habitación';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!(await askConfirm(`¿Eliminar «${room.name}»?`))) return;
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
}

function renderPlayStatus() {
  const el = $('#play-status');
  const letters = charactersFor(charCount());
  const placed = Object.values(state.placements).filter((v) => letters.includes(v)).length;
  const conflicts = computeConflicts();
  if (conflicts.size > 0) {
    el.className = 'status bad';
    el.textContent = `⚠️ Hay ${conflicts.size} casillas en conflicto (misma fila/columna o sobre un obstáculo).`;
  } else if (placed === letters.length) {
    el.className = 'status ok';
    el.textContent = '🎉 ¡Todos colocados y sin conflictos!';
  } else {
    el.className = 'status';
    el.textContent = `${placed} de ${letters.length} personajes colocados.`;
  }
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
    const idx = state.manualX.indexOf(k);
    if (idx >= 0) state.manualX.splice(idx, 1);
    else state.manualX.push(k);
    saveState(); renderBoard();
    return;
  }
  if (selectedChar) {
    if (state.placements[k] === selectedChar) {
      delete state.placements[k];
    } else {
      if (isObstacle(r, c)) { flashCell(cell); return; }
      const prev = placementCellOf(selectedChar);
      if (prev) delete state.placements[prev];
      state.placements[k] = selectedChar;
    }
    saveState(); renderCharChips(); renderPlayStatus(); renderBoard();
    return;
  }
  if (state.placements[k]) {
    delete state.placements[k];
    saveState(); renderCharChips(); renderPlayStatus(); renderBoard();
  }
}

function applyEditAt(r, c) {
  const k = key(r, c);
  if (state.step === 2) {
    if (!selectedRoomId || state.cellRoom[k] === selectedRoomId) return;
    state.cellRoom[k] = selectedRoomId;
  } else if (state.step === 3) {
    if (furnTool === 'borrar') {
      if (!state.furniture[k]) return;
      delete state.furniture[k];
    } else {
      if (state.furniture[k] === furnTool) return;
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

  board.addEventListener('pointerdown', (ev) => {
    const cell = ev.target.closest('.cell');
    if (!cell) return;
    const r = +cell.dataset.r, c = +cell.dataset.c;
    if (state.step === 4) {
      handlePlayClick(r, c, cell);
    } else {
      painting = true;
      applyEditAt(r, c);
    }
  });

  board.addEventListener('pointerover', (ev) => {
    if (!painting) return;
    const cell = ev.target.closest('.cell');
    if (cell) applyEditAt(+cell.dataset.r, +cell.dataset.c);
  });

  window.addEventListener('pointerup', () => { painting = false; });
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
  for (const dict of [state.cellRoom, state.furniture, state.placements]) {
    for (const k of Object.keys(dict)) if (!inBounds(k)) delete dict[k];
  }
  const letters = charactersFor(charCount());
  for (const [k, v] of Object.entries(state.placements)) if (!letters.includes(v)) delete state.placements[k];
  state.manualX = state.manualX.filter(inBounds);
}

function setRows(rows) {
  const r = Math.max(MIN_SIZE, Math.min(MAX_SIZE, rows));
  if (r === state.rows) return;
  state.rows = r;
  pruneOutOfBounds();
  saveState();
  renderAll();
}

function setCols(cols) {
  const c = Math.max(MIN_SIZE, Math.min(MAX_SIZE, cols));
  if (c === state.cols) return;
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

  $$('#furn-tools .tool-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      furnTool = btn.dataset.furn;
      renderFurnTools();
    });
  });

  $('#btn-xtool').addEventListener('click', () => {
    xToolActive = !xToolActive;
    if (xToolActive) selectedChar = null;
    renderCharChips();
  });

  $('#btn-clear-plays').addEventListener('click', async () => {
    if (!(await askConfirm('¿Quitar todos los personajes y tachaduras manuales?'))) return;
    state.placements = {};
    state.manualX = [];
    saveState();
    renderCharChips(); renderPlayStatus(); renderBoard();
  });

  $('#btn-new').addEventListener('click', async () => {
    if (!(await askConfirm('¿Empezar un mapa nuevo desde cero? Se borrará el actual.'))) return;
    state = blankState();
    selectedChar = null;
    xToolActive = false;
    selectedRoomId = null;
    furnTool = 'obstaculo';
    saveState();
    renderAll();
  });

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
