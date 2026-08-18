'use strict';

/* ============================================================
 * Murdoku · mapa digital
 * Aplicación 100% estática (GitHub Pages).
 * ============================================================ */

const STORAGE_KEY = 'murdoku-state-v1';

const FURNITURE_TYPES = [
  { id: 'cama',       name: 'Cama (se puede estar encima)',  icon: '🛏️', blocks: false },
  { id: 'silla',      name: 'Silla (se puede sentar)',       icon: '🪑', blocks: false },
  { id: 'mesa',       name: 'Mesa / encimera',               icon: '🟫', blocks: true },
  { id: 'planta',     name: 'Planta',                        icon: '🪴', blocks: true },
  { id: 'estanteria', name: 'Estantería',                    icon: '📚', blocks: true },
  { id: 'comoda',     name: 'Cómoda / mesita',               icon: '🗄️', blocks: true },
  { id: 'aparato',    name: 'Aparato (TV, radio…)',          icon: '📺', blocks: true },
  { id: 'tocadiscos', name: 'Tocadiscos / música',           icon: '🎵', blocks: true },
  { id: 'otro',       name: 'Otro mueble',                   icon: '📦', blocks: true },
];

const ROOM_PALETTE = ['#8ec9e8', '#c5aee8', '#f5a8c0', '#ffcc80', '#a5d6a7', '#fff59d', '#ffab91', '#b0bec5', '#e6ee9c'];
const CHAR_PALETTE = ['#a1887f', '#f9a825', '#ad1457', '#78909c', '#7e57c2', '#ec407a', '#5d4037', '#00897b', '#37474f'];

const key = (r, c) => `${r},${c}`;

/* ------------------------------------------------------------
 * Puzle de ejemplo: el mapa de la foto del libro.
 * ------------------------------------------------------------ */
function defaultState() {
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
  put('comoda', [0, 1]);
  put('mesa', [2, 0]);
  put('silla', [3, 0]);
  // Cocina
  put('mesa', [0, 2], [1, 4], [2, 4], [3, 4], [3, 3]);
  put('planta', [1, 2]);
  // Cuarto de invitados
  put('comoda', [0, 5], [2, 7]);
  put('cama', [0, 6], [1, 6], [0, 7], [1, 7]);
  put('aparato', [2, 5]);
  // Comedor
  put('silla', [3, 5], [4, 4], [5, 5], [5, 8]);
  put('planta', [3, 8]);
  put('mesa', [4, 5], [4, 6], [4, 7], [4, 8]);
  // Dormitorio
  put('cama', [5, 1], [6, 1], [5, 2], [6, 2]);
  put('mesa', [7, 0], [7, 3]);
  put('planta', [8, 1]);
  put('estanteria', [8, 3]);
  // Salón
  put('mesa', [6, 4]);
  put('estanteria', [6, 5]);
  put('tocadiscos', [6, 6]);
  put('planta', [7, 4]);
  put('silla', [7, 8], [8, 5], [8, 6], [8, 8]);

  const windows = {
    [key(1, 8)]: ['e'],
    [key(4, 8)]: ['e'],
    [key(6, 8)]: ['e'],
    [key(5, 0)]: ['w'],
    [key(8, 0)]: ['w'],
  };

  const characters = [
    { id: 'ashton',    name: 'Ashton',    color: '#a1887f', victim: false },
    { id: 'bruce',     name: 'Bruce',     color: '#f9a825', victim: false },
    { id: 'charlotte', name: 'Charlotte', color: '#ad1457', victim: false },
    { id: 'dakota',    name: 'Dakota',    color: '#78909c', victim: false },
    { id: 'ethan',     name: 'Ethan',     color: '#7e57c2', victim: false },
    { id: 'fanny',     name: 'Fanny',     color: '#ec407a', victim: false },
    { id: 'gloria',    name: 'Gloria',    color: '#5d4037', victim: false },
    { id: 'hazel',     name: 'Hazel',     color: '#00897b', victim: false },
    { id: 'vin',       name: 'Vin',       color: '#37474f', victim: true },
  ];

  return {
    rows: 9,
    cols: 9,
    rooms,
    cellRoom,
    furniture,
    windows,
    characters,
    placements: {},   // "r,c" -> charId
    manualX: [],      // ["r,c", ...]
    furnitureBlocks: true,
    notes: '',
    answer: '',
    bgImage: null,
    bgOpacity: 50,
  };
}

/* ------------------------------------------------------------
 * Estado y persistencia
 * ------------------------------------------------------------ */
let state = loadState();
let mode = 'play';                 // 'play' | 'edit'
let selectedCharId = null;
let xToolActive = false;
let selectedRoomId = state.rooms[0] ? state.rooms[0].id : null;
let painting = false;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.rows && s.cols && Array.isArray(s.characters)) return { ...defaultState(), ...s };
    }
  } catch (e) { /* estado corrupto: se ignora */ }
  return defaultState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // Cuota superada (normalmente por la imagen de fondo): se guarda sin imagen.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, bgImage: null }));
    } catch (e2) { /* sin persistencia */ }
  }
}

/* ------------------------------------------------------------
 * Utilidades
 * ------------------------------------------------------------ */
const $ = (sel) => document.querySelector(sel);

function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(240, 235, 238, ${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function furnitureType(id) {
  return FURNITURE_TYPES.find((t) => t.id === id) || FURNITURE_TYPES[FURNITURE_TYPES.length - 1];
}

function roomOf(r, c) {
  return state.cellRoom[key(r, c)] || null;
}

function isBlockedCell(r, c) {
  if (!state.furnitureBlocks) return false;
  const f = state.furniture[key(r, c)];
  return !!f && furnitureType(f).blocks;
}

/** Casillas tachadas automáticamente por las filas/columnas de los colocados. */
function computeAutoX() {
  const auto = new Set();
  for (const [k, charId] of Object.entries(state.placements)) {
    if (!charId) continue;
    const [r, c] = k.split(',').map(Number);
    for (let i = 0; i < state.cols; i++) if (i !== c) auto.add(key(r, i));
    for (let i = 0; i < state.rows; i++) if (i !== r) auto.add(key(i, c));
  }
  return auto;
}

/** Colocaciones en conflicto (misma fila o columna que otro personaje). */
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
  }
  for (const [k] of entries) {
    const [r, c] = k.split(',').map(Number);
    if (isBlockedCell(r, c)) conflicts.add(k);
  }
  return conflicts;
}

function placementCellOf(charId) {
  for (const [k, v] of Object.entries(state.placements)) if (v === charId) return k;
  return null;
}

/* ------------------------------------------------------------
 * Render del tablero
 * ------------------------------------------------------------ */
function labelCells() {
  // Para cada habitación: casilla de su fila más baja, columna central.
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
  board.innerHTML = '';
  board.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;

  const autoX = mode === 'play' ? computeAutoX() : new Set();
  const conflicts = mode === 'play' ? computeConflicts() : new Set();
  const manualX = new Set(state.manualX);
  const labels = labelCells();
  const roomById = Object.fromEntries(state.rooms.map((r) => [r.id, r]));
  const charById = Object.fromEntries(state.characters.map((ch) => [ch.id, ch]));

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const k = key(r, c);
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;

      const roomId = roomOf(r, c);
      if (roomId && roomById[roomId]) {
        cell.style.background = hexToRgba(roomById[roomId].color, 0.45);
      } else {
        cell.classList.add('no-room');
      }

      // Paredes gruesas donde cambia la habitación o se acaba el mapa.
      const sides = { n: [r - 1, c], s: [r + 1, c], w: [r, c - 1], e: [r, c + 1] };
      for (const [side, [nr, nc]] of Object.entries(sides)) {
        const out = nr < 0 || nc < 0 || nr >= state.rows || nc >= state.cols;
        const neighborRoom = out ? undefined : roomOf(nr, nc);
        if (out || neighborRoom !== roomId) {
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
      const furnId = state.furniture[k];
      if (furnId) {
        const t = furnitureType(furnId);
        const span = document.createElement('span');
        span.className = 'furn';
        span.textContent = t.icon;
        cell.appendChild(span);
        if (t.blocks && state.furnitureBlocks) {
          cell.classList.add('furn-blocking');
          if (mode === 'play') {
            const x = document.createElement('span');
            x.className = 'xmark furniture-x';
            x.textContent = '✕';
            cell.appendChild(x);
          }
        }
      }

      if (mode === 'play') {
        const charId = state.placements[k];
        if (charId && charById[charId]) {
          const ch = charById[charId];
          const token = document.createElement('div');
          token.className = 'token' + (conflicts.has(k) ? ' conflict' : '');
          token.style.background = ch.color;
          token.textContent = (ch.name.trim()[0] || '?').toUpperCase();
          token.title = ch.name + (ch.victim ? ' (víctima)' : '');
          cell.appendChild(token);
          cell.classList.add('has-token');
        } else if (manualX.has(k)) {
          const x = document.createElement('span');
          x.className = 'xmark manual';
          x.textContent = '✕';
          cell.appendChild(x);
        } else if (autoX.has(k) && !furnId) {
          const x = document.createElement('span');
          x.className = 'xmark auto';
          x.textContent = '✕';
          cell.appendChild(x);
        } else if (autoX.has(k) && furnId && !isBlockedCell(r, c)) {
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

  // Imagen de fondo (modo edición)
  const img = $('#bg-img');
  if (state.bgImage && mode === 'edit') {
    img.src = state.bgImage;
    img.hidden = false;
    img.style.opacity = state.bgOpacity / 100;
  } else {
    img.hidden = true;
  }
}

/* ------------------------------------------------------------
 * Render de paneles
 * ------------------------------------------------------------ */
function renderCharChips() {
  const wrap = $('#char-chips');
  wrap.innerHTML = '';
  for (const ch of state.characters) {
    const placedAt = placementCellOf(ch.id);
    const chip = document.createElement('button');
    chip.className = 'chip'
      + (selectedCharId === ch.id ? ' selected' : '')
      + (placedAt ? ' placed' : '')
      + (ch.victim ? ' victim' : '');
    chip.innerHTML = `<span class="dot" style="background:${ch.color}"></span><span class="name"></span>${placedAt ? '<span class="check">✔</span>' : ''}`;
    chip.querySelector('.name').textContent = ch.name + (ch.victim ? ' ☠' : '');
    chip.addEventListener('click', () => {
      selectedCharId = selectedCharId === ch.id ? null : ch.id;
      xToolActive = false;
      renderPanels();
    });
    wrap.appendChild(chip);
  }
  $('#btn-xtool').classList.toggle('selected', xToolActive);
}

function renderPlayStatus() {
  const el = $('#play-status');
  const placed = Object.values(state.placements).filter(Boolean).length;
  const total = state.characters.length;
  const conflicts = computeConflicts();
  if (conflicts.size > 0) {
    el.className = 'status bad';
    el.textContent = `⚠️ Hay ${conflicts.size} casillas en conflicto (misma fila/columna o sobre un mueble).`;
  } else if (placed === total && total > 0) {
    el.className = 'status ok';
    el.textContent = '🎉 ¡Todos colocados y sin conflictos!';
  } else {
    el.className = 'status';
    el.textContent = `${placed} de ${total} personajes colocados.`;
  }
}

function renderCharEditor() {
  const wrap = $('#char-editor');
  wrap.innerHTML = '';
  state.characters.forEach((ch, i) => {
    const row = document.createElement('div');
    row.className = 'char-row';

    const color = document.createElement('input');
    color.type = 'color';
    color.value = ch.color;
    color.addEventListener('input', () => { ch.color = color.value; saveState(); renderBoard(); renderCharChips(); });

    const name = document.createElement('input');
    name.type = 'text';
    name.value = ch.name;
    name.addEventListener('change', () => { ch.name = name.value.trim() || ch.name; saveState(); renderAll(); });

    const victimBtn = document.createElement('button');
    victimBtn.className = 'small';
    victimBtn.textContent = ch.victim ? '☠' : '🙂';
    victimBtn.title = ch.victim ? 'Es la víctima (pulsa para cambiar)' : 'Marcar como víctima';
    victimBtn.addEventListener('click', () => { ch.victim = !ch.victim; saveState(); renderAll(); });

    const del = document.createElement('button');
    del.className = 'small danger';
    del.textContent = '🗑';
    del.title = 'Eliminar personaje';
    del.addEventListener('click', () => {
      state.characters.splice(i, 1);
      for (const [k, v] of Object.entries(state.placements)) if (v === ch.id) delete state.placements[k];
      if (selectedCharId === ch.id) selectedCharId = null;
      saveState(); renderAll();
    });

    row.append(color, name, victimBtn, del);
    wrap.appendChild(row);
  });
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
    row.addEventListener('click', () => {
      selectedRoomId = room.id;
      const radio = document.querySelector('input[name="etool"][value="room"]');
      if (radio) radio.checked = true;
      renderRoomList();
    });

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
    rename.addEventListener('click', (e) => {
      e.stopPropagation();
      const n = prompt('Nombre de la habitación:', room.name);
      if (n && n.trim()) { room.name = n.trim(); saveState(); renderRoomList(); renderBoard(); }
    });

    const del = document.createElement('button');
    del.textContent = '🗑';
    del.title = 'Eliminar habitación (sus casillas quedan vacías)';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(`¿Eliminar «${room.name}»?`)) return;
      state.rooms = state.rooms.filter((r) => r.id !== room.id);
      for (const [k, v] of Object.entries(state.cellRoom)) if (v === room.id) delete state.cellRoom[k];
      saveState(); renderRoomList(); renderBoard();
    });

    row.append(color, name, rename, del);
    wrap.appendChild(row);
  }
}

function renderEditControls() {
  $('#grid-rows').value = state.rows;
  $('#grid-cols').value = state.cols;
  $('#bg-opacity').value = state.bgOpacity;
  $('#opt-furniture-blocks').checked = state.furnitureBlocks;
}

function renderPanels() {
  renderCharChips();
  renderPlayStatus();
  renderCharEditor();
  renderRoomList();
  renderEditControls();
  renderBoard();
}

function renderAll() {
  $('#panel-play').hidden = mode !== 'play';
  $('#panel-edit').hidden = mode !== 'edit';
  $('#btn-mode-play').classList.toggle('active', mode === 'play');
  $('#btn-mode-edit').classList.toggle('active', mode === 'edit');
  $('#notes').value = state.notes;
  $('#answer-input').value = state.answer;
  renderPanels();
}

/* ------------------------------------------------------------
 * Interacción con el tablero
 * ------------------------------------------------------------ */
function currentEditTool() {
  const checked = document.querySelector('input[name="etool"]:checked');
  return checked ? checked.value : 'room';
}

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
  if (selectedCharId) {
    if (state.placements[k] === selectedCharId) {
      delete state.placements[k];
    } else {
      if (isBlockedCell(r, c)) { flashCell(cell); return; }
      const prev = placementCellOf(selectedCharId);
      if (prev) delete state.placements[prev];
      state.placements[k] = selectedCharId;
    }
    saveState(); renderPanels();
    return;
  }
  if (state.placements[k]) {
    delete state.placements[k];
    saveState(); renderPanels();
  }
}

function applyEditAt(r, c, tool, ev) {
  const k = key(r, c);
  if (tool === 'room') {
    if (!selectedRoomId) return;
    if (state.cellRoom[k] === selectedRoomId) return;
    state.cellRoom[k] = selectedRoomId;
  } else if (tool === 'furniture') {
    const type = $('#furniture-type').value;
    if (state.furniture[k] === type) return;
    state.furniture[k] = type;
  } else if (tool === 'erase') {
    if (!state.furniture[k] && !state.windows[k] && !state.cellRoom[k]) return;
    delete state.furniture[k];
    delete state.windows[k];
    if (ev && ev.type === 'pointerdown' && ev.altKey) delete state.cellRoom[k];
  } else if (tool === 'window') {
    if (!ev || ev.type !== 'pointerdown') return; // solo con clic directo
    const rect = ev.currentTarget ? ev.currentTarget.getBoundingClientRect() : null;
    const box = rect || ev.target.getBoundingClientRect();
    const x = ev.clientX - box.left;
    const y = ev.clientY - box.top;
    const dists = { n: y, s: box.height - y, w: x, e: box.width - x };
    const side = Object.entries(dists).sort((a, b) => a[1] - b[1])[0][0];
    const arr = state.windows[k] || [];
    const idx = arr.indexOf(side);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(side);
    if (arr.length) state.windows[k] = arr; else delete state.windows[k];
  }
  saveState();
  renderBoard();
}

function cellFromEvent(ev) {
  const cell = ev.target.closest('.cell');
  if (!cell) return null;
  return { cell, r: +cell.dataset.r, c: +cell.dataset.c };
}

function setupBoardEvents() {
  const board = $('#board');

  board.addEventListener('pointerdown', (ev) => {
    const hit = cellFromEvent(ev);
    if (!hit) return;
    if (mode === 'play') {
      handlePlayClick(hit.r, hit.c, hit.cell);
      return;
    }
    painting = true;
    // La herramienta de ventana necesita las coordenadas del clic dentro de la celda.
    applyEditAt(hit.r, hit.c, currentEditTool(), {
      type: 'pointerdown',
      clientX: ev.clientX,
      clientY: ev.clientY,
      altKey: ev.altKey,
      currentTarget: hit.cell,
      target: hit.cell,
    });
  });

  board.addEventListener('pointerover', (ev) => {
    if (!painting || mode !== 'edit') return;
    const hit = cellFromEvent(ev);
    if (!hit) return;
    const tool = currentEditTool();
    if (tool === 'window') return; // las ventanas solo con clic
    applyEditAt(hit.r, hit.c, tool, null);
  });

  window.addEventListener('pointerup', () => { painting = false; });
}

/* ------------------------------------------------------------
 * Controles
 * ------------------------------------------------------------ */
function setupControls() {
  $('#btn-mode-play').addEventListener('click', () => { mode = 'play'; renderAll(); });
  $('#btn-mode-edit').addEventListener('click', () => { mode = 'edit'; renderAll(); });

  $('#btn-xtool').addEventListener('click', () => {
    xToolActive = !xToolActive;
    if (xToolActive) selectedCharId = null;
    renderPanels();
  });

  $('#btn-clear-plays').addEventListener('click', () => {
    if (!confirm('¿Quitar todos los personajes y tachaduras manuales?')) return;
    state.placements = {};
    state.manualX = [];
    saveState(); renderPanels();
  });

  $('#btn-add-char').addEventListener('click', () => {
    const name = prompt('Nombre del personaje:');
    if (!name || !name.trim()) return;
    state.characters.push({
      id: 'ch' + Date.now(),
      name: name.trim(),
      color: CHAR_PALETTE[state.characters.length % CHAR_PALETTE.length],
      victim: false,
    });
    saveState(); renderAll();
  });

  $('#btn-add-room').addEventListener('click', () => {
    const name = prompt('Nombre de la habitación:');
    if (!name || !name.trim()) return;
    const room = {
      id: 'room' + Date.now(),
      name: name.trim(),
      color: ROOM_PALETTE[state.rooms.length % ROOM_PALETTE.length],
    };
    state.rooms.push(room);
    selectedRoomId = room.id;
    const radio = document.querySelector('input[name="etool"][value="room"]');
    if (radio) radio.checked = true;
    saveState(); renderRoomList();
  });

  $('#btn-apply-size').addEventListener('click', () => {
    const rows = Math.max(3, Math.min(15, +$('#grid-rows').value || state.rows));
    const cols = Math.max(3, Math.min(15, +$('#grid-cols').value || state.cols));
    state.rows = rows;
    state.cols = cols;
    // Limpia lo que quede fuera del nuevo tamaño.
    const inBounds = (k) => {
      const [r, c] = k.split(',').map(Number);
      return r < rows && c < cols;
    };
    for (const dict of [state.cellRoom, state.furniture, state.windows, state.placements]) {
      for (const k of Object.keys(dict)) if (!inBounds(k)) delete dict[k];
    }
    state.manualX = state.manualX.filter(inBounds);
    saveState(); renderAll();
  });

  $('#bg-file').addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.bgImage = reader.result;
      saveState(); renderBoard();
    };
    reader.readAsDataURL(file);
  });

  $('#bg-opacity').addEventListener('input', (ev) => {
    state.bgOpacity = +ev.target.value;
    $('#bg-img').style.opacity = state.bgOpacity / 100;
    saveState();
  });

  $('#btn-bg-remove').addEventListener('click', () => {
    state.bgImage = null;
    $('#bg-file').value = '';
    saveState(); renderBoard();
  });

  $('#opt-furniture-blocks').addEventListener('change', (ev) => {
    state.furnitureBlocks = ev.target.checked;
    saveState(); renderBoard();
  });

  $('#btn-clear-map').addEventListener('click', () => {
    if (!confirm('¿Vaciar todo el mapa (habitaciones, muebles, ventanas y colocaciones)?')) return;
    state.cellRoom = {};
    state.furniture = {};
    state.windows = {};
    state.placements = {};
    state.manualX = [];
    saveState(); renderAll();
  });

  $('#btn-reset-all').addEventListener('click', () => {
    if (!confirm('¿Descartar todo y volver al puzle de ejemplo del libro?')) return;
    state = defaultState();
    selectedCharId = null;
    xToolActive = false;
    selectedRoomId = state.rooms[0].id;
    saveState(); renderAll();
  });

  $('#btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'murdoku-puzle.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const s = JSON.parse(reader.result);
        if (!s || typeof s.rows !== 'number' || typeof s.cols !== 'number') throw new Error('formato');
        state = { ...defaultState(), ...s };
        selectedCharId = null;
        xToolActive = false;
        saveState(); renderAll();
      } catch (e) {
        alert('El archivo no parece un puzle de Murdoku válido.');
      }
      ev.target.value = '';
    };
    reader.readAsText(file);
  });

  $('#notes').addEventListener('input', (ev) => { state.notes = ev.target.value; saveState(); });
  $('#answer-input').addEventListener('input', (ev) => { state.answer = ev.target.value; saveState(); });

  // Selector de tipo de mueble
  const sel = $('#furniture-type');
  for (const t of FURNITURE_TYPES) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.icon} ${t.name}`;
    sel.appendChild(opt);
  }

  // Elegir mueble o habitación activa su herramienta.
  sel.addEventListener('focus', () => {
    const radio = document.querySelector('input[name="etool"][value="furniture"]');
    if (radio) radio.checked = true;
  });
}

/* ------------------------------------------------------------
 * Arranque
 * ------------------------------------------------------------ */
setupControls();
setupBoardEvents();
renderAll();
