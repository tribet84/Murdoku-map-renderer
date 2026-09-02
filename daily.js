'use strict';

/* ============================================================
 * Caso del día: generador de casos con pistas y resolutor.
 *
 * Todo es determinista a partir de la fecha (semilla), así que
 * cualquier persona que abra la app el mismo día recibe el mismo
 * caso sin necesidad de servidor. Funciona en el navegador y en
 * Node (para las pruebas).
 * ============================================================ */
(function (root) {
  const DAILY_EPOCH = '2026-09-02'; // el caso nº 1

  /* ---------- Semilla y azar reproducible ---------- */
  function hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const key = (r, c) => `${r},${c}`;
  const parse = (k) => k.split(',').map(Number);

  /* ---------- Datos del mundo ---------- */
  const ROOM_POOL = [
    { name: 'Biblioteca', art: 'la' }, { name: 'Cocina', art: 'la' }, { name: 'Invernadero', art: 'el' },
    { name: 'Salón', art: 'el' }, { name: 'Despacho', art: 'el' }, { name: 'Dormitorio', art: 'el' },
    { name: 'Comedor', art: 'el' }, { name: 'Vestíbulo', art: 'el' }, { name: 'Sala de billar', art: 'la' },
    { name: 'Bodega', art: 'la' }, { name: 'Terraza', art: 'la' }, { name: 'Galería', art: 'la' },
    { name: 'Observatorio', art: 'el' }, { name: 'Cuarto de costura', art: 'el' }, { name: 'Sala de música', art: 'la' },
    { name: 'Trastero', art: 'el' }, { name: 'Capilla', art: 'la' }, { name: 'Lavadero', art: 'el' },
  ];
  const ROOM_COLORS = ['#8ec9e8', '#c5aee8', '#f5a8c0', '#ffcc80', '#a5d6a7', '#fff59d', '#ffab91', '#b0bec5'];

  // Obstáculos con tipo: bloquean la casilla y sirven para las pistas de "junto a".
  const OBSTACLES = ['planta', 'mesa', 'estanteria'];
  const OBSTACLE_TEXT = { planta: 'una planta', mesa: 'una mesa', estanteria: 'una estantería', cama: 'una cama' };
  const ON_TEXT = { silla: 'en una silla', cama: 'sobre una cama', alfombra: 'sobre una alfombra' };

  /* ---------- Utilidades ---------- */
  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
  const randInt = (lo, hi, rnd) => lo + Math.floor(rnd() * (hi - lo + 1)); // inclusive

  /* ---------- Plano: partición en habitaciones ---------- */
  function splitRect(rect, rnd) {
    // Devuelve dos rectángulos, o null si no se puede partir dejando al menos 2 de lado.
    const { r1, r2, c1, c2 } = rect;
    const h = r2 - r1 + 1, w = c2 - c1 + 1;
    const options = [];
    if (h >= 4) options.push('h');
    if (w >= 4) options.push('v');
    if (!options.length) return null;
    const dir = pick(options, rnd);
    if (dir === 'h') {
      const cut = randInt(r1 + 2, r2 - 1, rnd); // primera fila de la segunda parte
      return [{ r1, r2: cut - 1, c1, c2 }, { r1: cut, r2, c1, c2 }];
    }
    const cut = randInt(c1 + 2, c2 - 1, rnd);
    return [{ r1, r2, c1, c2: cut - 1 }, { r1, r2, c1: cut, c2 }];
  }

  function makeRooms(rows, cols, targetCount, rnd) {
    let rects = [{ r1: 0, r2: rows - 1, c1: 0, c2: cols - 1 }];
    let guard = 0;
    while (rects.length < targetCount && guard++ < 50) {
      // parte el rectángulo más grande que se pueda partir
      const idx = rects
        .map((rc, i) => ({ i, area: (rc.r2 - rc.r1 + 1) * (rc.c2 - rc.c1 + 1) }))
        .sort((a, b) => b.area - a.area)
        .map((x) => x.i)
        .find((i) => splitRect(rects[i], rnd));
      if (idx === undefined) break;
      const parts = splitRect(rects[idx], rnd);
      rects.splice(idx, 1, ...parts);
    }
    const names = shuffle(ROOM_POOL, rnd).slice(0, rects.length);
    const colors = shuffle(ROOM_COLORS, rnd);
    const rooms = rects.map((rc, i) => ({
      id: 'room' + (i + 1), name: names[i].name, art: names[i].art, color: colors[i % colors.length], rect: rc,
    }));
    const cellRoom = {};
    for (const room of rooms) {
      for (let r = room.rect.r1; r <= room.rect.r2; r++) {
        for (let c = room.rect.c1; c <= room.rect.c2; c++) cellRoom[key(r, c)] = room.id;
      }
    }
    return { rooms, cellRoom };
  }

  /* ---------- Muebles ---------- */
  function furnish(rows, cols, rooms, cellRoom, rnd) {
    const furniture = {};
    const rugs = [];
    const windows = {};
    const free = (r, c) => !furniture[key(r, c)];

    for (const room of rooms) {
      const { r1, r2, c1, c2 } = room.rect;
      const cells = [];
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) cells.push([r, c]);
      const area = cells.length;
      const order = shuffle(cells, rnd);

      // Como mucho un tercio de la habitación puede ser obstáculo, y nunca toda una fila o columna del mapa.
      const maxObst = Math.max(1, Math.floor(area / 3));
      let nObst = randInt(1, Math.min(maxObst, 3), rnd);
      for (const [r, c] of order) {
        if (nObst <= 0) break;
        if (!free(r, c)) continue;
        furniture[key(r, c)] = pick(OBSTACLES, rnd);
        nObst--;
      }

      // Cama de dos casillas (a veces), horizontal o vertical, dentro de la habitación.
      if (area >= 6 && rnd() < 0.45) {
        const pairs = [];
        for (const [r, c] of cells) {
          if (c + 1 <= c2 && free(r, c) && free(r, c + 1)) pairs.push([[r, c], [r, c + 1]]);
          if (r + 1 <= r2 && free(r, c) && free(r + 1, c)) pairs.push([[r, c], [r + 1, c]]);
        }
        if (pairs.length) {
          const [[ra, ca], [rb, cb]] = pick(pairs, rnd);
          furniture[key(ra, ca)] = 'cama';
          furniture[key(rb, cb)] = 'cama';
        }
      }

      // Butacas.
      let nChairs = randInt(0, 2, rnd);
      for (const [r, c] of shuffle(cells, rnd)) {
        if (nChairs <= 0) break;
        if (!free(r, c)) continue;
        furniture[key(r, c)] = 'silla';
        nChairs--;
      }

      // Alfombra (a veces): un bloque de 1×2 o 2×2 que no pise obstáculos ni camas.
      if (area >= 6 && rnd() < 0.5) {
        const w = randInt(1, 2, rnd), h = randInt(1, 2, rnd);
        const spots = [];
        for (let r = r1; r + h - 1 <= r2; r++) {
          for (let c = c1; c + w - 1 <= c2; c++) {
            let ok = true;
            for (let dr = 0; dr < h && ok; dr++) for (let dc = 0; dc < w && ok; dc++) {
              const f = furniture[key(r + dr, c + dc)];
              if (f && f !== 'silla') ok = false;
            }
            if (ok) spots.push([r, c]);
          }
        }
        if (spots.length) {
          const [r0, c0] = pick(spots, rnd);
          for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) rugs.push(key(r0 + dr, c0 + dc));
        }
      }
    }

    // Ventanas en las paredes exteriores.
    const outer = [];
    for (let r = 0; r < rows; r++) { outer.push([r, 0, 'w']); outer.push([r, cols - 1, 'e']); }
    for (let c = 0; c < cols; c++) { outer.push([0, c, 'n']); outer.push([rows - 1, c, 's']); }
    let nWin = randInt(2, 4, rnd);
    for (const [r, c, side] of shuffle(outer, rnd)) {
      if (nWin <= 0) break;
      const k = key(r, c);
      if (windows[k]) continue;
      windows[k] = [side];
      nWin--;
    }

    return { furniture, rugs, windows };
  }

  /* ---------- Hechos sobre una casilla ---------- */
  function isObstacle(f) {
    return f === 'obstaculo' || OBSTACLES.includes(f);
  }

  function makeWorld(p) {
    const roomOf = (r, c) => p.cellRoom[key(r, c)];
    const inside = (r, c) => r >= 0 && c >= 0 && r < p.rows && c < p.cols;
    const neighbors = (r, c) => [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
      .filter(([nr, nc]) => inside(nr, nc) && roomOf(nr, nc) === roomOf(r, c));
    const adjacentTo = (r, c, type) => neighbors(r, c).some(([nr, nc]) => p.furniture[key(nr, nc)] === type);
    const on = (r, c, type) => (type === 'alfombra' ? p.rugs.includes(key(r, c)) : p.furniture[key(r, c)] === type);
    const atWindow = (r, c) => Boolean(p.windows[key(r, c)] && p.windows[key(r, c)].length);
    const openCells = [];
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) if (!isObstacle(p.furniture[key(r, c)])) openCells.push([r, c]);
    return { roomOf, neighbors, adjacentTo, on, atWindow, openCells };
  }

  /* ---------- Pistas: predicados que se evalúan sobre una asignación ---------- */
  // Una pista es { letter, kind, ..., text }. `test(sol)` devuelve true/false/null (null = aún no decidible).
  function clueTest(clue, sol, world) {
    const pos = sol[clue.letter];
    if (!pos) return null;
    const [r, c] = pos;
    switch (clue.kind) {
      case 'room': return world.roomOf(r, c) === clue.room;
      case 'notRoom': return world.roomOf(r, c) !== clue.room;
      case 'adjacent': return world.adjacentTo(r, c, clue.type);
      case 'on': return world.on(r, c, clue.type);
      case 'notOn': return !world.on(r, c, clue.type);
      case 'window': return world.atWindow(r, c);
      case 'notWindow': return !world.atWindow(r, c);
      case 'sameRoom': {
        const other = sol[clue.other];
        if (!other) return null;
        return world.roomOf(r, c) === world.roomOf(other[0], other[1]);
      }
      case 'otherRoom': {
        const other = sol[clue.other];
        if (!other) return null;
        return world.roomOf(r, c) !== world.roomOf(other[0], other[1]);
      }
      case 'north': { const o = sol[clue.other]; return o ? r < o[0] : null; }
      case 'south': { const o = sol[clue.other]; return o ? r > o[0] : null; }
      case 'west': { const o = sol[clue.other]; return o ? c < o[1] : null; }
      case 'east': { const o = sol[clue.other]; return o ? c > o[1] : null; }
      case 'alone': {
        // Solo decidible cuando todos están colocados.
        const letters = Object.keys(sol);
        if (letters.length < clue.total) return null;
        const room = world.roomOf(r, c);
        return letters.every((L) => L === clue.letter || world.roomOf(sol[L][0], sol[L][1]) !== room);
      }
      case 'victim': {
        // "La víctima estaba sola con el asesino": exactamente otra persona en su habitación.
        const letters = Object.keys(sol);
        if (letters.length < clue.total) return null;
        const room = world.roomOf(r, c);
        const others = letters.filter((L) => L !== clue.letter && world.roomOf(sol[L][0], sol[L][1]) === room);
        return others.length === 1;
      }
      default: return true;
    }
  }

  function clueText(clue, roomsById, letterName) {
    const L = letterName(clue.letter);
    const room = (id) => { const rm = roomsById[id]; return `${rm.art} ${rm.name}`; };
    switch (clue.kind) {
      case 'room': return `${L} estaba en ${room(clue.room)}.`;
      case 'notRoom': return `${L} no estaba en ${room(clue.room)}.`;
      case 'adjacent': return `${L} estaba junto a ${OBSTACLE_TEXT[clue.type]}.`;
      case 'on': return `${L} estaba ${ON_TEXT[clue.type]}.`;
      case 'notOn': return `${L} no estaba ${ON_TEXT[clue.type]}.`;
      case 'window': return `${L} estaba directamente delante de una ventana.`;
      case 'notWindow': return `${L} no estaba delante de ninguna ventana.`;
      case 'sameRoom': return `${L} estaba en la misma habitación que ${letterName(clue.other)}.`;
      case 'otherRoom': return `${L} no estaba en la misma habitación que ${letterName(clue.other)}.`;
      case 'north': return `${L} estaba en una fila más al norte que ${letterName(clue.other)}.`;
      case 'south': return `${L} estaba en una fila más al sur que ${letterName(clue.other)}.`;
      case 'west': return `${L} estaba en una columna más al oeste que ${letterName(clue.other)}.`;
      case 'east': return `${L} estaba en una columna más al este que ${letterName(clue.other)}.`;
      case 'alone': return `${L} era la única persona de su habitación.`;
      case 'victim': return `${L} es la víctima. Estaba a solas con el asesino.`;
      default: return '';
    }
  }

  /* ---------- Resolutor: cuenta soluciones (hasta `limit`) ---------- */
  function countSolutions(p, clues, world, limit) {
    const letters = p.letters;
    const total = letters.length;
    const byLetter = {};
    for (const cl of clues) (byLetter[cl.letter] = byLetter[cl.letter] || []).push(cl);
    const usedRow = new Array(p.rows).fill(false);
    const usedCol = new Array(p.cols).fill(false);
    const sol = {};
    let count = 0;

    // Orden: letras con más pistas unarias primero (más poda).
    const order = letters.slice().sort((a, b) => (byLetter[b] || []).length - (byLetter[a] || []).length);

    function consistent() {
      for (const cl of clues) {
        const t = clueTest(cl, sol, world);
        if (t === false) return false;
      }
      return true;
    }

    function place(i) {
      if (count >= limit) return;
      if (i === total) { if (consistent()) count++; return; }
      const L = order[i];
      for (const [r, c] of world.openCells) {
        if (usedRow[r] || usedCol[c]) continue;
        sol[L] = [r, c];
        usedRow[r] = usedCol[c] = true;
        // Poda con las pistas de esta letra y las binarias ya decidibles.
        let ok = true;
        for (const cl of clues) {
          if (cl.letter !== L && cl.other !== L) continue;
          if (clueTest(cl, sol, world) === false) { ok = false; break; }
        }
        if (ok) place(i + 1);
        usedRow[r] = usedCol[c] = false;
        delete sol[L];
        if (count >= limit) return;
      }
    }
    place(0);
    return count;
  }

  /* ---------- Solución y pistas ---------- */
  function randomSolution(p, world, rnd) {
    // Permutación fila→columna evitando obstáculos; la víctima debe compartir habitación con exactamente una persona.
    for (let attempt = 0; attempt < 400; attempt++) {
      const cols = shuffle([...Array(p.cols).keys()], rnd).slice(0, p.rows);
      const rowsOrder = shuffle([...Array(p.rows).keys()], rnd);
      const sol = {};
      let ok = true;
      p.letters.forEach((L, i) => {
        const r = rowsOrder[i], c = cols[i];
        if (isObstacle(p.furniture[key(r, c)])) ok = false;
        sol[L] = [r, c];
      });
      if (!ok) continue;
      const victim = { letter: 'V', kind: 'victim', total: p.letters.length };
      if (clueTest(victim, sol, world) !== true) continue;
      return sol;
    }
    return null;
  }

  function truthsFor(L, sol, p, world, roomsById) {
    const [r, c] = sol[L];
    const out = [];
    const roomId = world.roomOf(r, c);
    out.push({ letter: L, kind: 'room', room: roomId });
    for (const rm of p.rooms) if (rm.id !== roomId) out.push({ letter: L, kind: 'notRoom', room: rm.id });
    for (const t of ['planta', 'mesa', 'estanteria', 'cama']) if (world.adjacentTo(r, c, t)) out.push({ letter: L, kind: 'adjacent', type: t });
    for (const t of ['silla', 'cama', 'alfombra']) out.push({ letter: L, kind: world.on(r, c, t) ? 'on' : 'notOn', type: t });
    out.push({ letter: L, kind: world.atWindow(r, c) ? 'window' : 'notWindow' });
    for (const M of p.letters) {
      if (M === L) continue;
      const [mr, mc] = sol[M];
      const same = world.roomOf(mr, mc) === roomId;
      out.push({ letter: L, kind: same ? 'sameRoom' : 'otherRoom', other: M });
      out.push({ letter: L, kind: r < mr ? 'north' : 'south', other: M });
      out.push({ letter: L, kind: c < mc ? 'west' : 'east', other: M });
    }
    const alone = p.letters.every((M) => M === L || world.roomOf(sol[M][0], sol[M][1]) !== roomId);
    if (alone) out.push({ letter: L, kind: 'alone', total: p.letters.length });
    return out;
  }

  // Pistas "interesantes" primero: las negaciones y las de orientación pesan menos.
  const KIND_WEIGHT = {
    adjacent: 5, on: 5, window: 5, room: 4, sameRoom: 4, alone: 4,
    north: 2, south: 2, west: 2, east: 2, otherRoom: 1, notOn: 1, notWindow: 1, notRoom: 1,
  };
  function weightedPick(list, rnd) {
    const total = list.reduce((s, cl) => s + (KIND_WEIGHT[cl.kind] || 1), 0);
    let x = rnd() * total;
    for (const cl of list) {
      x -= (KIND_WEIGHT[cl.kind] || 1);
      if (x <= 0) return cl;
    }
    return list[list.length - 1];
  }

  function chooseClues(p, sol, world, roomsById, rnd) {
    const suspects = p.letters.filter((L) => L !== 'V');
    const pools = {};
    for (const L of suspects) pools[L] = shuffle(truthsFor(L, sol, p, world, roomsById), rnd);
    const victim = { letter: 'V', kind: 'victim', total: p.letters.length };

    // La víctima también puede aportar hechos sobre su casilla.
    const victimPool = shuffle(truthsFor('V', sol, p, world, roomsById).filter((cl) => !['sameRoom', 'otherRoom', 'alone'].includes(cl.kind)), rnd);

    let clues = [victim, ...suspects.map((L) => weightedPick(pools[L], rnd))];
    const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    let solutions = countSolutions(p, clues, world, 2);
    let guard = 0;
    while (solutions !== 1 && guard++ < 40) {
      if (solutions === 0) return null; // no debería pasar: las pistas son verdades
      // Añade la pista que más reduzca el nº de soluciones (probando unas cuantas candidatas).
      const candidates = [];
      for (const L of [...suspects, 'V']) {
        const pool = L === 'V' ? victimPool : pools[L];
        for (const cl of shuffle(pool, rnd).slice(0, 6)) {
          if (clues.some((c) => sameKey(c, cl))) continue;
          candidates.push(cl);
        }
      }
      if (!candidates.length) return null;
      // Las pistas de orientación ("más al norte que…") son las menos divertidas:
      // solo se usan si ninguna otra reduce el número de soluciones.
      const isOrientation = (cl) => ['north', 'south', 'west', 'east'].includes(cl.kind);
      const tryGroup = (group) => {
        let best = null, bestCount = Infinity;
        for (const cl of shuffle(group, rnd).slice(0, 12)) {
          const n = countSolutions(p, [...clues, cl], world, 12);
          if (n < bestCount) { best = cl; bestCount = n; }
          if (n === 1) break;
        }
        return { best, bestCount };
      };
      const current = countSolutions(p, clues, world, 12);
      let { best, bestCount } = tryGroup(candidates.filter((cl) => !isOrientation(cl)));
      if (!best || bestCount >= current) {
        const alt = tryGroup(candidates.filter(isOrientation));
        if (alt.best && alt.bestCount < bestCount) ({ best, bestCount } = alt);
      }
      if (!best) return null;
      clues.push(best);
      solutions = bestCount === Infinity ? countSolutions(p, clues, world, 2) : Math.min(bestCount, 2);
    }
    if (solutions !== 1) return null;

    // Poda: quita pistas redundantes manteniendo al menos una por sospechoso.
    for (let i = clues.length - 1; i >= 1; i--) {
      const cl = clues[i];
      const remainingForLetter = clues.filter((c, j) => j !== i && c.letter === cl.letter && c.kind !== 'victim').length;
      if (cl.letter !== 'V' && remainingForLetter === 0) continue;
      const trial = clues.filter((_, j) => j !== i);
      if (countSolutions(p, trial, world, 2) === 1) clues = trial;
    }
    return clues;
  }

  /* ---------- Generación completa ---------- */
  function letterName(L) { return L; }

  function generate(seedText, opts = {}) {
    const rows = opts.rows || 6, cols = opts.cols || 6;
    for (let attempt = 0; attempt < 60; attempt++) {
      const rnd = mulberry32(hashString(`${seedText}#${attempt}`));
      const { rooms, cellRoom } = makeRooms(rows, cols, randInt(4, 5, rnd), rnd);
      const { furniture, rugs, windows } = furnish(rows, cols, rooms, cellRoom, rnd);
      const count = Math.min(rows, cols);
      const letters = [];
      for (let i = 0; i < count - 1; i++) letters.push(String.fromCharCode(65 + i));
      letters.push('V');
      const p = { rows, cols, rooms, cellRoom, furniture, rugs, windows, letters };
      const world = makeWorld(p);
      if (world.openCells.length < count * 2) continue;
      const sol = randomSolution(p, world, rnd);
      if (!sol) continue;
      const roomsById = Object.fromEntries(rooms.map((rm) => [rm.id, rm]));
      const clues = chooseClues(p, sol, world, roomsById, rnd);
      if (!clues) continue;

      const victimRoom = world.roomOf(sol.V[0], sol.V[1]);
      const murderer = letters.find((L) => L !== 'V' && world.roomOf(sol[L][0], sol[L][1]) === victimRoom);

      // Orden de presentación: víctima al final, como en el libro; cada sospechoso agrupa sus frases.
      const byLetter = {};
      for (const cl of clues) (byLetter[cl.letter] = byLetter[cl.letter] || []).push(cl);
      const clueCards = letters.map((L) => ({
        letter: L,
        lines: (byLetter[L] || []).map((cl) => clueText(cl, roomsById, letterName)),
      })).filter((card) => card.lines.length);

      return {
        seed: seedText,
        rows, cols,
        rooms: rooms.map(({ id, name, color }) => ({ id, name, color })),
        cellRoom, furniture, rugs, windows, letters,
        solution: Object.fromEntries(letters.map((L) => [L, key(sol[L][0], sol[L][1])])),
        murderer,
        clues: clueCards,
        clueObjects: clues, // forma estructurada, para pruebas y depuración
        attempt,
      };
    }
    return null;
  }

  /* ---------- Fecha del caso ---------- */
  function dateKey(d = new Date()) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function puzzleNumber(dateStr) {
    const a = new Date(dateStr + 'T00:00:00'), b = new Date(DAILY_EPOCH + 'T00:00:00');
    return Math.round((a - b) / 86400000) + 1;
  }

  const api = { generate, dateKey, puzzleNumber, countSolutions, makeWorld, OBSTACLES, DAILY_EPOCH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CrimleDaily = api;
})(typeof window !== 'undefined' ? window : globalThis);
