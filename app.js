'use strict';

/* ============================================================
 * Crimle · un asesinato al día
 * Dos secciones, elegidas por la ruta (#dia / #editor):
 *  - Caso del día (portada): un caso generado por fecha, igual para todos.
 *  - Editor de mapas: asistente en 4 pasos (tamaño → habitaciones → muebles →
 *    resolver) para dibujar y resolver los planos de los libros de puzles.
 * ============================================================ */

const LIBRARY_KEY = 'crimle-library-v1';          // varios mapas con nombre
const DAILY_KEY = 'crimle-daily-v1';              // el caso de hoy y su progreso
const DAILY_STATS_KEY = 'crimle-daily-stats-v1';  // rachas y casos resueltos
const STORAGE_KEY = 'murdoku-state-v3';           // formato antiguo: un solo mapa (se migra al arrancar)

// La app se llamó Murdoku antes de ser Crimle: si hay datos con el nombre viejo, se
// pasan al nuevo una sola vez para no perder mapas ni rachas.
(function migrateStorageNames() {
  const renames = [
    ['murdoku-library-v4', LIBRARY_KEY],
    ['murdoku-daily-v1', DAILY_KEY],
    ['murdoku-daily-stats-v1', DAILY_STATS_KEY],
  ];
  for (const [oldKey, newKey] of renames) {
    try {
      const raw = localStorage.getItem(oldKey);
      if (raw !== null) {
        if (localStorage.getItem(newKey) === null) localStorage.setItem(newKey, raw);
        localStorage.removeItem(oldKey);
      }
    } catch (e) { /* sin almacenamiento */ }
  }
})();
const MIN_SIZE = 3;
const MAX_SIZE = 15;

const ROOM_PALETTE = ['#8ec9e8', '#c5aee8', '#f5a8c0', '#ffcc80', '#a5d6a7', '#fff59d', '#ffab91', '#b0bec5', '#e6ee9c'];
const CHAR_PALETTE = ['#a1887f', '#f9a825', '#ad1457', '#78909c', '#7e57c2', '#ec407a', '#5d4037', '#00897b', '#8e24aa', '#039be5', '#7cb342', '#6d4c41', '#00acc1', '#f4511e'];
const VICTIM_COLOR = '#37474f';

// 'obstaculo' y 'cama' se dibujan aparte, y las alfombras son su propia capa
// (state.rugs); aquí solo van los muebles con un simple icono centrado.
/** Butaca vista desde arriba (respaldo, dos brazos y asiento), como en el libro. */
const CHAIR_SVG = `<svg viewBox="0 0 24 24" class="chair-svg" aria-hidden="true">
  <rect class="chair-back" x="3.2" y="2.2" width="17.6" height="6.4" rx="3.1"/>
  <rect class="chair-arm" x="2" y="6.6" width="4.6" height="14.6" rx="2.3"/>
  <rect class="chair-arm" x="17.4" y="6.6" width="4.6" height="14.6" rx="2.3"/>
  <rect class="chair-seat" x="5.6" y="8.2" width="12.8" height="12.9" rx="2.8"/>
</svg>`;

const FURNITURE = {
  silla: { svg: CHAIR_SVG },
};

/** Obstáculos: bloquean la casilla. Los que tienen tipo se dibujan y sirven para las pistas ("junto a una planta"). */
const OBSTACLE_TYPES = new Set(['obstaculo', 'planta', 'mesa', 'estanteria']);
const OBSTACLE_SVG = {
  planta: `<svg viewBox="0 0 24 24" class="furn-svg" aria-hidden="true">
    <path class="pot" d="M7 14h10l-1.6 7H8.6z"/>
    <ellipse class="leaf" cx="8.2" cy="9.6" rx="2.3" ry="4.2" transform="rotate(-38 8.2 9.6)"/>
    <ellipse class="leaf" cx="15.8" cy="9.6" rx="2.3" ry="4.2" transform="rotate(38 15.8 9.6)"/>
    <ellipse class="leaf" cx="12" cy="7.6" rx="2.6" ry="5.2"/>
  </svg>`,
  mesa: `<svg viewBox="0 0 24 24" class="furn-svg" aria-hidden="true">
    <rect class="wood" x="2.5" y="5" width="19" height="14" rx="3"/>
    <rect class="wood-light" x="5.5" y="8" width="13" height="8" rx="1.6"/>
  </svg>`,
  estanteria: `<svg viewBox="0 0 24 24" class="furn-svg" aria-hidden="true">
    <rect class="wood" x="2.5" y="6" width="19" height="12" rx="1.6"/>
    <rect class="book b1" x="4.6" y="8.2" width="3" height="7.6"/>
    <rect class="book b2" x="8.2" y="8.2" width="2.4" height="7.6"/>
    <rect class="book b3" x="11.2" y="8.2" width="3.4" height="7.6"/>
    <rect class="book b4" x="15.2" y="8.2" width="1.9" height="7.6"/>
    <rect class="book b5" x="17.7" y="8.2" width="2.2" height="7.6"/>
  </svg>`,
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
 * Mapa de ejemplo: una casa inventada (9×9) que enseña todos los
 * elementos de la app: habitaciones, obstáculos, butacas, camas,
 * alfombras y ventanas. No reproduce ningún caso del libro.
 * ------------------------------------------------------------ */
function exampleState() {
  const rooms = [
    { id: 'biblioteca',  name: 'Biblioteca',      color: '#c5aee8' },
    { id: 'musica',      name: 'Sala de música',  color: '#fff59d' },
    { id: 'invernadero', name: 'Invernadero',     color: '#a5d6a7' },
    { id: 'cocina',      name: 'Cocina',          color: '#8ec9e8' },
    { id: 'dormitorio',  name: 'Dormitorio',      color: '#f5a8c0' },
    { id: 'recibidor',   name: 'Recibidor',       color: '#ffcc80' },
  ];

  const cellRoom = {};
  const assign = (roomId, r1, r2, c1, c2) => {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) cellRoom[key(r, c)] = roomId;
  };
  assign('biblioteca', 0, 3, 0, 3);
  assign('musica', 0, 2, 4, 8);
  assign('invernadero', 3, 5, 4, 8);
  assign('cocina', 4, 6, 0, 3);
  assign('dormitorio', 6, 8, 4, 8);
  assign('recibidor', 7, 8, 0, 3);

  const furniture = {};
  const put = (type, ...cells) => cells.forEach(([r, c]) => { furniture[key(r, c)] = type; });
  // Biblioteca: estanterías arriba, dos butacas y una mesita sobre la alfombra, una planta
  put('obstaculo', [0, 0], [0, 1], [0, 2], [2, 2], [3, 0]);
  put('silla', [2, 1], [2, 3]);
  // Sala de música: piano, arpa y dos butacas
  put('obstaculo', [0, 4], [0, 7], [0, 8]);
  put('silla', [1, 5], [2, 6]);
  // Invernadero: plantas en las esquinas y una butaca en el centro
  put('obstaculo', [3, 4], [3, 8], [5, 4], [5, 8]);
  put('silla', [4, 6]);
  // Cocina: encimera en L, mesa y dos sillas
  put('obstaculo', [4, 0], [5, 0], [6, 0], [6, 1], [5, 2]);
  put('silla', [4, 3], [6, 3]);
  // Dormitorio: cama de dos casillas, mesita, estantería y una butaca
  put('cama', [6, 5], [6, 6]);
  put('obstaculo', [6, 7], [7, 8], [8, 8]);
  put('silla', [8, 5]);
  // Recibidor: perchero y mesita
  put('obstaculo', [8, 0], [7, 3]);

  const rugs = [
    key(2, 1), key(2, 2), key(2, 3), key(3, 1), key(3, 2), key(3, 3), // biblioteca
    key(1, 6), key(1, 7), key(2, 6), key(2, 7),                       // sala de música
    key(7, 6), key(7, 7), key(8, 6), key(8, 7),                       // dormitorio
  ];

  const windows = {
    [key(2, 0)]: ['w'],
    [key(1, 8)]: ['e'],
    [key(4, 8)]: ['e'],
    [key(4, 0)]: ['w'],
    [key(6, 8)]: ['e'],
    [key(8, 2)]: ['s'],
  };

  return {
    rows: 9,
    cols: 9,
    rooms,
    cellRoom,
    furniture,
    windows,          // "r,c" -> ["n"|"s"|"e"|"w", ...]
    rugs,             // ["r,c", ...] capa aparte: una alfombra puede tener un mueble encima
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
    rugs: [],
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
/**
 * Antes las alfombras vivían en `furniture` (una sola cosa por casilla). Ahora son
 * una capa aparte, para poder poner un obstáculo o una planta encima de una alfombra.
 */
function migrateState(s) {
  if (!Array.isArray(s.rugs)) s.rugs = [];
  for (const [k, v] of Object.entries(s.furniture || {})) {
    if (v !== 'alfombra') continue;
    if (!s.rugs.includes(k)) s.rugs.push(k);
    delete s.furniture[k];
  }
  return s;
}

function isValidState(s) {
  return s && typeof s.rows === 'number' && typeof s.cols === 'number' && Array.isArray(s.rooms);
}

/* ------------------------------------------------------------
 * Biblioteca de mapas: { currentId, maps: [{ id, name, updatedAt, state }] }
 * Cada caso del libro puede tener su propio mapa.
 * ------------------------------------------------------------ */
function newId() {
  return 'map' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function makeMapEntry(name, st) {
  return { id: newId(), name, updatedAt: Date.now(), state: st };
}

function loadLibrary() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (raw) {
      const lib = JSON.parse(raw);
      if (lib && Array.isArray(lib.maps) && lib.maps.length) {
        lib.maps = lib.maps.filter((m) => m && isValidState(m.state));
        for (const m of lib.maps) m.state = migrateState({ ...blankState(), ...m.state });
        if (lib.maps.length) {
          if (!lib.maps.some((m) => m.id === lib.currentId)) lib.currentId = lib.maps[0].id;
          return lib;
        }
      }
    }
  } catch (e) { /* biblioteca corrupta o almacenamiento no disponible */ }

  // Migración desde el formato antiguo de un solo mapa.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (isValidState(s)) {
        const entry = makeMapEntry('Mi mapa', migrateState({ ...blankState(), ...s }));
        return { currentId: entry.id, maps: [entry] };
      }
    }
  } catch (e) { /* se ignora */ }

  const entry = makeMapEntry('Casa de ejemplo', exampleState());
  return { currentId: entry.id, maps: [entry] };
}

function currentMap() {
  return library.maps.find((m) => m.id === library.currentId) || library.maps[0];
}

function saveLibrary() {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  } catch (e) { /* sin persistencia */ }
}

/** Guarda el mapa abierto dentro de la biblioteca (o el caso del día, si es el que está abierto). */
function saveState() {
  if (dailyMode) { daily.state = state; saveDaily(); return; }
  const m = currentMap();
  m.state = state;
  m.updatedAt = Date.now();
  saveLibrary();
}

let library = loadLibrary();
let state = currentMap().state;
let selectedChar = null;
let xToolActive = false;
let candidateToolActive = false;
let selectedRoomId = state.rooms[0] ? state.rooms[0].id : null;
let furnTool = 'obstaculo';
let painting = false;

/* ------------------------------------------------------------
 * Deshacer / rehacer: pilas de instantáneas del mapa abierto.
 * ------------------------------------------------------------ */
const UNDO_LIMIT = 50;
const undoStack = [];
const redoStack = [];
let strokeUndoPushed = false; // evita apilar una vez por casilla al pintar arrastrando

function updateUndoButton() {
  const u = $('#btn-undo');
  if (u) u.disabled = undoStack.length === 0;
  const r = $('#btn-redo');
  if (r) r.disabled = redoStack.length === 0;
}

/** Instantánea justo antes de un cambio real. Un cambio nuevo invalida lo que había para rehacer. */
function pushUndo() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
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
  redoStack.push(JSON.stringify(state));
  state = JSON.parse(undoStack.pop());
  saveState();
  renderAll();
  updateUndoButton();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(state));
  state = JSON.parse(redoStack.pop());
  saveState();
  renderAll();
  updateUndoButton();
}

/** Al cambiar de mapa, el historial del anterior deja de tener sentido. */
function clearHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  updateUndoButton();
}

/* ------------------------------------------------------------
 * Gestión de mapas
 * ------------------------------------------------------------ */
function openMap(id) {
  if (!library.maps.some((m) => m.id === id)) return;
  dailyMode = false;
  document.body.classList.remove('daily');
  if (location.hash !== '#editor') history.replaceState(null, '', '#editor');
  library.currentId = id;
  state = currentMap().state;
  selectedChar = null;
  xToolActive = false;
  candidateToolActive = false;
  selectedRoomId = state.rooms[0] ? state.rooms[0].id : null;
  furnTool = 'obstaculo';
  wasSolved = computeSolved(); // abrir un mapa ya resuelto no lanza confeti
  clearHistory();
  saveLibrary();
  renderAll();
}

function createMap(name, st) {
  const entry = makeMapEntry(name, st);
  library.maps.unshift(entry);
  saveLibrary();
  openMap(entry.id);
  return entry;
}

function nextMapName() {
  const n = library.maps.length + 1;
  let name = `Mapa ${n}`;
  let i = n;
  while (library.maps.some((m) => m.name === name)) name = `Mapa ${++i}`;
  return name;
}

function relativeTime(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'ahora mismo';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return new Date(ts).toLocaleDateString('es-ES');
}

/* ------------------------------------------------------------
 * Caso del día: un caso generado a partir de la fecha (ver daily.js),
 * igual para todo el mundo, con pistas, comprobación y resultado
 * compartible. Vive aparte de la biblioteca de mapas.
 * ------------------------------------------------------------ */
// Dirección pública que va en el texto compartido. Cuando haya dominio propio, cambiar aquí
// y en las etiquetas og:url / og:image de index.html.
const SITE_URL = 'https://tribet84.github.io/Murdoku-map-renderer/';
let dailyMode = false;
let daily = null; // { date, number, puzzle, state, checks, solvedSeconds }

function loadJSON(k, fallback) {
  try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
}
function saveJSON(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin persistencia */ }
}
function loadDailyStats() {
  return loadJSON(DAILY_STATS_KEY, { played: 0, wins: 0, streak: 0, bestStreak: 0, lastWinDate: null });
}

function dailyStateFromPuzzle(p) {
  return {
    rows: p.rows, cols: p.cols, rooms: p.rooms, cellRoom: p.cellRoom, furniture: p.furniture,
    windows: p.windows, rugs: p.rugs.slice(), placements: {}, candidates: {}, manualX: [],
    answer: '', step: 4, timerSeconds: 0,
  };
}

function loadDaily() {
  const D = window.CrimleDaily;
  if (!D) return null;
  const today = D.dateKey();
  const saved = loadJSON(DAILY_KEY, null);
  if (saved && saved.date === today && saved.puzzle && isValidState(saved.state)) {
    saved.state = migrateState({ ...blankState(), ...saved.state });
    return saved;
  }
  const puzzle = D.generate(today);
  if (!puzzle) return null;
  const stats = loadDailyStats();
  stats.played += 1;
  saveJSON(DAILY_STATS_KEY, stats);
  return { date: today, number: D.puzzleNumber(today), puzzle, state: dailyStateFromPuzzle(puzzle), checks: 0, solvedSeconds: null };
}

function saveDaily() {
  if (daily) saveJSON(DAILY_KEY, daily);
}

let dailyLoading = false; // generando el caso de hoy (tarda unos segundos en móvil)

function dailyCached() {
  const saved = loadJSON(DAILY_KEY, null);
  return Boolean(saved && window.CrimleDaily && saved.date === window.CrimleDaily.dateKey());
}

function enterDaily(generateNow = false) {
  if (!generateNow && !dailyCached()) {
    // Primera apertura del día: se avisa antes de generar, que bloquea unos segundos.
    dailyLoading = true;
    renderDaily();
    setTimeout(() => {
      dailyLoading = false;
      if (location.hash !== '#editor') enterDaily(true); else renderDaily();
    }, 30);
    return;
  }
  const d = loadDaily();
  if (!d) {
    // Sin generador no hay caso: se queda en el editor, que funciona igual.
    history.replaceState(null, '', '#editor');
    renderAll();
    askConfirm('No se ha podido preparar el caso de hoy. Prueba a recargar la página.');
    return;
  }
  daily = d;
  dailyMode = true;
  document.body.classList.add('daily');
  state = daily.state;
  state.step = 4;
  selectedChar = null;
  xToolActive = false;
  candidateToolActive = false;
  wasSolved = computeSolved(); // volver a un caso ya resuelto no relanza el confeti
  clearHistory();
  saveDaily();
  if (location.hash !== '#dia') history.replaceState(null, '', '#dia');
  renderAll();
}

function leaveDaily() {
  if (dailyMode) openMap(library.currentId);
}

/** Aplica la sección que marca la ruta: '#editor' abre el editor; cualquier otra, el caso del día (la portada). */
function applyRoute() {
  if (location.hash === '#editor') { leaveDaily(); return; }
  if (!dailyMode) enterDaily();
}

function dailyCorrectCount() {
  if (!daily) return 0;
  return Object.entries(daily.puzzle.solution).filter(([L, k]) => state.placements[k] === L).length;
}

function dailySolved() {
  return Boolean(daily) && dailyCorrectCount() === daily.puzzle.letters.length;
}

function recordDailyWin() {
  const stats = loadDailyStats();
  if (stats.lastWinDate === daily.date) return stats; // ya contado
  const y = new Date(daily.date + 'T00:00:00');
  y.setDate(y.getDate() - 1);
  const yesterday = window.CrimleDaily.dateKey(y);
  stats.streak = stats.lastWinDate === yesterday ? stats.streak + 1 : 1;
  stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  stats.wins += 1;
  stats.lastWinDate = daily.date;
  saveJSON(DAILY_STATS_KEY, stats);
  daily.solvedSeconds = state.timerSeconds;
  saveDaily();
  return stats;
}

function checksText(n) {
  if (n === 0) return 'sin usar «Comprobar»';
  return `${n} comprobaci${n === 1 ? 'ón' : 'ones'}`;
}

function dailyShareText() {
  const p = daily.puzzle;
  const squares = ['🟦', '🟪', '🟥', '🟧', '🟩', '🟨', '🟫', '⬜'];
  const roomIdx = Object.fromEntries(p.rooms.map((r, i) => [r.id, i]));
  const solAt = {};
  for (const [L, k] of Object.entries(p.solution)) solAt[k] = L;
  const grid = [];
  for (let r = 0; r < p.rows; r++) {
    let line = '';
    for (let c = 0; c < p.cols; c++) {
      const k = key(r, c);
      if (solAt[k]) line += solAt[k] === 'V' ? '💀' : '🕵️';
      else if (OBSTACLE_TYPES.has(p.furniture[k])) line += '⬛';
      else line += squares[roomIdx[p.cellRoom[k]] % squares.length];
    }
    grid.push(line);
  }
  const stats = loadDailyStats();
  const [y, m, d] = daily.date.split('-');
  return [
    `🔎 Crimle #${daily.number} · ${d}/${m}/${y}`,
    `⏱️ ${formatTime(daily.solvedSeconds ?? state.timerSeconds)} · ✅ ${checksText(daily.checks)} · 🔥 racha ${stats.streak}`,
    ...grid,
    SITE_URL,
  ].join('\n');
}

let dailyFeedbackFresh = false; // el aviso de «Comprobar» vale hasta el siguiente cambio en el tablero

function showDailyFeedback(text, kind = '') {
  const el = $('#daily-feedback');
  if (!el) return;
  el.hidden = false;
  el.className = 'status' + (kind ? ` ${kind}` : '');
  el.textContent = text;
  dailyFeedbackFresh = true;
}

async function shareDaily() {
  const text = dailyShareText();
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    showDailyFeedback('Resultado copiado. Pégalo donde quieras presumir.', 'ok');
  } catch (e) {
    showDailyFeedback('No se ha podido compartir desde aquí. Copia el texto del resultado a mano.', 'bad');
  }
}

function checkDaily() {
  if (!dailyMode) return;
  const total = daily.puzzle.letters.length;
  const placed = Object.keys(state.placements).length;
  const ok = dailyCorrectCount();
  daily.checks += 1;
  saveDaily();
  if (ok === total) showDailyFeedback('¡Todo en su sitio!', 'ok');
  else if (placed < total) showDailyFeedback(`${ok} de ${placed} colocados están bien. Faltan ${total - placed} por colocar.`);
  else showDailyFeedback(`${ok} de ${total} en su sitio. Sigue deduciendo.`, 'bad');
  renderDaily();
}

function showDailyResult(stats) {
  const p = daily.puzzle;
  const roomName = (p.rooms.find((r) => r.id === p.cellRoom[p.solution.V]) || {}).name || 'su habitación';
  $('#result-text').textContent =
    `El asesino es ${p.murderer}: estaba a solas con la víctima en la habitación ${roomName}. `
    + `Tiempo ${formatTime(daily.solvedSeconds ?? state.timerSeconds)}, ${checksText(daily.checks)}. `
    + `Racha: ${stats.streak} (mejor: ${stats.bestStreak}). Casos resueltos: ${stats.wins}.`;
  $('#result-grid').textContent = dailyShareText().split('\n').slice(2, -1).join('\n');
  $('#dlg-result').showModal();
}

function renderDaily() {
  document.body.classList.toggle('daily', dailyMode || dailyLoading);
  document.body.classList.toggle('daily-loading', dailyLoading);
  const card = $('#daily-card');
  if (!card) return;
  card.hidden = !(dailyMode || dailyLoading);
  if (dailyLoading) {
    $('#daily-title').textContent = '🔎 Preparando el caso de hoy…';
    $('#daily-checks').textContent = '';
    $('#clue-list').innerHTML = '';
    $('#daily-feedback').hidden = true;
    $('#btn-share').hidden = true;
    return;
  }
  if (!dailyMode) return;
  if (!dailyFeedbackFresh) $('#daily-feedback').hidden = true;
  dailyFeedbackFresh = false;
  const [y, m, d] = daily.date.split('-');
  $('#daily-title').textContent = `🗓️ Crimle #${daily.number} · ${d}/${m}/${y}`;
  $('#daily-checks').textContent = daily.checks ? checksText(daily.checks) : '';
  const ol = $('#clue-list');
  ol.innerHTML = '';
  const letters = daily.puzzle.letters;
  for (const cc of daily.puzzle.clues) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = charColor(cc.letter, letters.indexOf(cc.letter));
    dot.textContent = cc.letter;
    const txt = document.createElement('span');
    txt.textContent = cc.lines.join(' ');
    li.append(dot, txt);
    if (placementCellOf(cc.letter)) li.classList.add('placed');
    ol.appendChild(li);
  }
  $('#btn-share').hidden = !wasSolved;
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
  return OBSTACLE_TYPES.has(state.furniture[key(r, c)]);
}

/** ¿La casilla vecina está en el mapa y en la misma habitación (sin pared entre medias)? */
function sameRoomNeighbor(r, c, dr, dc) {
  const nr = r + dr, nc = c + dc;
  if (nr < 0 || nc < 0 || nr >= state.rows || nc >= state.cols) return false;
  return roomOf(r, c) === roomOf(nr, nc);
}

/** Vecina válida para fusionar muebles: mismo tipo, dentro del mapa y sin pared entre medias. */
function furnitureNeighbor(r, c, dr, dc, type) {
  if (!sameRoomNeighbor(r, c, dr, dc)) return false;
  return state.furniture[key(r + dr, c + dc)] === type;
}

function hasRug(r, c) {
  return state.rugs.includes(key(r, c));
}

/** Vecina válida para fusionar alfombras: también alfombra y sin pared entre medias. */
function rugNeighbor(r, c, dr, dc) {
  if (!sameRoomNeighbor(r, c, dr, dc)) return false;
  return hasRug(r + dr, c + dc);
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

      // Alfombra: va por debajo, así que puede tener un mueble encima.
      if (hasRug(r, c)) {
        const n = rugNeighbor(r, c, -1, 0);
        const s = rugNeighbor(r, c, 1, 0);
        const w2 = rugNeighbor(r, c, 0, -1);
        const e = rugNeighbor(r, c, 0, 1);
        const rug = document.createElement('div');
        rug.className = 'rug'
          + (n ? ' rug-n' : '') + (s ? ' rug-s' : '')
          + (w2 ? ' rug-w' : '') + (e ? ' rug-e' : '');
        rug.style.borderTopLeftRadius = (!n && !w2) ? '7px' : '0';
        rug.style.borderTopRightRadius = (!n && !e) ? '7px' : '0';
        rug.style.borderBottomLeftRadius = (!s && !w2) ? '7px' : '0';
        rug.style.borderBottomRightRadius = (!s && !e) ? '7px' : '0';
        cell.appendChild(rug);
      }

      // Mueble (encima de la alfombra, si la hay)
      const furn = state.furniture[k];
      if (OBSTACLE_TYPES.has(furn)) {
        cell.classList.add('obstacle');
        const fill = document.createElement('div');
        fill.className = 'obstacle-fill';
        cell.appendChild(fill);
        const typed = Boolean(OBSTACLE_SVG[furn]);
        if (typed) {
          const icon = document.createElement('span');
          icon.className = 'furn obstacle-icon';
          icon.innerHTML = OBSTACLE_SVG[furn]; // marcado propio y estático
          cell.appendChild(icon);
        }
        const x = document.createElement('span');
        x.className = 'xmark obstacle-x' + (typed ? ' typed' : '');
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
      } else if (furn && FURNITURE[furn]) {
        const span = document.createElement('span');
        span.className = 'furn';
        span.innerHTML = FURNITURE[furn].svg; // marcado propio y estático
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

let obstacleType = 'obstaculo'; // subtipo activo dentro de la herramienta «Obstáculo»

function renderFurnTools() {
  const obstacleFamily = OBSTACLE_TYPES.has(furnTool);
  $$('#furn-tools .tool-chip').forEach((btn) => {
    const isObstChip = btn.dataset.furn === 'obstaculo';
    btn.classList.toggle('selected', isObstChip ? obstacleFamily : btn.dataset.furn === furnTool);
  });
  const sub = $('#obstacle-types');
  if (sub) {
    sub.hidden = !obstacleFamily;
    $$('#obstacle-types .subtype').forEach((b) => b.classList.toggle('selected', b.dataset.obst === furnTool));
  }
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

/** Todos los personajes colocados y sin conflictos (en el caso del día: en su casilla correcta). */
function computeSolved() {
  if (dailyMode) return dailySolved();
  const letters = charactersFor(charCount());
  const placed = Object.values(state.placements).filter((v) => letters.includes(v)).length;
  return computeConflicts().size === 0 && placed === letters.length && letters.length > 0;
}

function renderPlayStatus() {
  const el = $('#play-status');
  const letters = charactersFor(charCount());
  const placed = Object.values(state.placements).filter((v) => letters.includes(v)).length;
  const conflicts = computeConflicts();
  const solved = computeSolved();
  if (conflicts.size > 0) {
    el.className = 'status bad';
    el.textContent = `⚠️ Hay ${conflicts.size} casillas en conflicto (misma fila/columna o sobre un obstáculo).`;
  } else if (solved) {
    el.className = 'status ok';
    el.textContent = '🎉 ¡Todos colocados y sin conflictos!';
  } else if (dailyMode && placed === letters.length) {
    el.className = 'status bad';
    el.textContent = 'Todos colocados, pero algo no cuadra. Pulsa «Comprobar» para ver cuántos están bien.';
  } else {
    const candCells = new Set(Object.values(state.candidates).flat()).size;
    el.className = 'status';
    el.textContent = `${placed} de ${letters.length} personajes colocados.`
      + (candCells ? ` ${candCells} casillas marcadas como «quizá».` : '');
  }
  const justSolved = solved && !wasSolved;
  if (justSolved) launchConfetti();
  wasSolved = solved;
  if (justSolved && dailyMode) {
    const stats = recordDailyWin();
    setTimeout(() => showDailyResult(stats), 700);
  }
  updateTimerRunState();
  renderDaily();
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

function renderMapName() {
  const el = $('#map-name');
  if (el) {
    if (dailyMode) {
      const [y, m, d] = daily.date.split('-');
      el.textContent = `Caso del día · #${daily.number} · ${d}/${m}/${y}`;
    } else {
      el.textContent = `Editor de mapas · ${currentMap().name}`;
    }
  }
  const dailyTab = $('#btn-daily');
  const editorTab = $('#btn-editor');
  if (dailyTab) { dailyTab.classList.toggle('selected', dailyMode); dailyTab.setAttribute('aria-pressed', String(dailyMode)); }
  if (editorTab) { editorTab.classList.toggle('selected', !dailyMode); editorTab.setAttribute('aria-pressed', String(!dailyMode)); }
}

function renderMapsList() {
  const ul = $('#maps-list');
  ul.innerHTML = '';
  const maps = [...library.maps].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const m of maps) {
    const isCurrent = m.id === library.currentId;
    const li = document.createElement('li');
    li.className = 'map-row' + (isCurrent ? ' current' : '');

    const info = document.createElement('button');
    info.type = 'button';
    info.className = 'map-info';
    info.title = isCurrent ? 'Mapa abierto' : 'Abrir este mapa';
    const name = document.createElement('strong');
    name.textContent = m.name;
    const meta = document.createElement('small');
    const st = m.state;
    const total = charactersFor(Math.min(st.rows, st.cols)).length;
    const placed = Object.keys(st.placements || {}).length;
    meta.textContent = `${st.rows}×${st.cols} · ${st.rooms.length} hab. · ${placed}/${total} colocados · ${relativeTime(m.updatedAt)}`;
    info.append(name, meta);
    if (isCurrent) {
      const badge = document.createElement('span');
      badge.className = 'map-badge';
      badge.textContent = 'Abierto';
      info.appendChild(badge);
    } else {
      info.addEventListener('click', () => { openMap(m.id); $('#dlg-maps').close(); });
    }

    const actions = document.createElement('div');
    actions.className = 'map-actions';
    const mk = (label, title, handler, cls = '') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'icon-btn small ' + cls;
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', handler);
      return b;
    };
    actions.append(
      mk('⧉', 'Duplicar', () => {
        createMap(`Copia de ${m.name}`, JSON.parse(JSON.stringify(m.state)));
        $('#dlg-maps').close();
      }),
      mk('✎', 'Renombrar', async () => {
        const n = await askText('Nombre del mapa:', m.name);
        if (n && n.trim()) { m.name = n.trim(); saveLibrary(); renderMapName(); renderMapsList(); }
      }),
      mk('🗑', 'Borrar', async () => {
        if (!(await askConfirm(`¿Borrar el mapa «${m.name}»? Esto no se puede deshacer.`))) return;
        library.maps = library.maps.filter((x) => x.id !== m.id);
        if (!library.maps.length) library.maps.push(makeMapEntry(nextMapName(), blankState()));
        if (library.currentId === m.id) openMap(library.maps[0].id); else saveLibrary();
        renderMapsList();
      }, 'danger'),
    );

    li.append(info, actions);
    ul.appendChild(li);
  }
}

function renderAll() {
  renderMapName();
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
      // Quita primero lo de encima; si la casilla solo tiene alfombra, quita la alfombra.
      if (state.furniture[k] || state.windows[k]) {
        pushUndoOnce();
        delete state.furniture[k];
        delete state.windows[k];
      } else if (hasRug(r, c)) {
        pushUndoOnce();
        state.rugs = state.rugs.filter((rk) => rk !== k);
      } else {
        return;
      }
    } else if (furnTool === 'alfombra') {
      if (hasRug(r, c)) return;
      pushUndoOnce();
      state.rugs.push(k);
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
  if (dailyMode) return; // el caso del día no se edita
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
  state.rugs = state.rugs.filter(inBounds);
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
      furnTool = btn.dataset.furn === 'obstaculo' ? obstacleType : btn.dataset.furn;
      renderFurnTools();
    });
  });
  $$('#obstacle-types .subtype').forEach((b) => {
    if (OBSTACLE_SVG[b.dataset.obst]) b.innerHTML = OBSTACLE_SVG[b.dataset.obst]; // marcado propio
    b.addEventListener('click', () => {
      obstacleType = b.dataset.obst;
      furnTool = obstacleType;
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

  $('#btn-restart').addEventListener('click', async () => {
    if (!(await askConfirm('¿Volver a jugar este mapa desde cero? Se quitan las letras, los «quizás», las tachaduras y el cronómetro vuelve a 00:00. El mapa se conserva.'))) return;
    pushUndo();
    state.placements = {};
    state.candidates = {};
    state.manualX = [];
    state.answer = '';
    state.timerSeconds = 0;
    if (dailyMode) { daily.checks = 0; daily.solvedSeconds = null; $('#daily-feedback').hidden = true; }
    saveState();
    renderAll();
  });

  // Las dos secciones se eligen por la ruta, así el botón «atrás» del navegador también vuelve.
  $('#btn-daily').addEventListener('click', () => { if (!dailyMode) location.hash = '#dia'; });
  $('#btn-editor').addEventListener('click', () => { if (dailyMode) location.hash = '#editor'; });
  window.addEventListener('hashchange', applyRoute);
  $('#btn-check').addEventListener('click', checkDaily);
  $('#btn-share').addEventListener('click', shareDaily);
  $('#result-share').addEventListener('click', shareDaily);
  $('#result-close').addEventListener('click', () => $('#dlg-result').close());

  $('#btn-clear-candidates').addEventListener('click', async () => {
    if (!(await askConfirm('¿Quitar todas las casillas marcadas como «quizá»?'))) return;
    pushUndo();
    state.candidates = {};
    saveState();
    renderCharChips(); renderPlayStatus(); renderBoard();
  });

  $('#btn-new').addEventListener('click', async () => {
    const name = await askText('Nombre del mapa nuevo:', nextMapName());
    if (name === null) return;
    createMap(name.trim() || nextMapName(), blankState());
    $('#dlg-maps').close();
  });

  $('#btn-maps').addEventListener('click', () => {
    renderMapsList();
    $('#dlg-maps').showModal();
  });
  $('#dlg-maps-close').addEventListener('click', () => $('#dlg-maps').close());

  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);

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
saveLibrary(); // normaliza en disco lo que venga de una versión anterior (ver migrateState / loadLibrary)
try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ya migrado */ }
applyRoute();               // portada: el caso del día, salvo que la ruta pida el editor
if (!dailyMode) renderAll(); // (enterDaily ya pinta todo)
updateUndoButton();

// PWA: instalable y disponible sin conexión. Solo tiene sentido servida por http(s).
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* sin SW, la app funciona igual */ });
}
