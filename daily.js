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
    // Para el resolutor: cada casilla abierta con su habitación y sus hechos unarios ya calculados.
    const cells = openCells.map(([r, c]) => ({ r, c, room: roomOf(r, c), win: atWindow(r, c) }));
    return { roomOf, neighbors, adjacentTo, on, atWindow, openCells, cells };
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

  /* ---------- Resolutor por dominios ----------
   * Cada letra tiene un dominio (casillas posibles). `propagate` recorta los dominios
   * con lo que se deduce sin ramificar (lo que haría una persona con lápiz); el
   * contador de soluciones ramifica solo cuando la propagación se queda sin más. */
  const UNARY = new Set(['room', 'notRoom', 'adjacent', 'on', 'notOn', 'window', 'notWindow']);
  const BINARY = new Set(['sameRoom', 'otherRoom', 'north', 'south', 'west', 'east']);

  function initialDomains(p, clues, world) {
    const domains = {};
    for (const L of p.letters) {
      const mine = clues.filter((cl) => cl.letter === L && UNARY.has(cl.kind));
      domains[L] = world.cells.filter((a) => mine.every((cl) => clueTest(cl, { [L]: [a.r, a.c] }, world) !== false));
    }
    return domains;
  }

  // Versión rápida de clueTest para las pistas entre dos personas, sobre celdas del resolutor.
  function pairOK(kind, a, b) {
    if (a.r === b.r || a.c === b.c) return false;
    switch (kind) {
      case 'sameRoom': return a.room === b.room;
      case 'otherRoom': return a.room !== b.room;
      case 'north': return a.r < b.r;
      case 'south': return a.r > b.r;
      case 'west': return a.c < b.c;
      case 'east': return a.c > b.c;
      default: return true;
    }
  }

  // Devuelve false si algún dominio se vacía (contradicción). Nunca quita una casilla que pueda ser solución.
  function propagate(p, clues, world, domains) {
    const letters = p.letters;
    let changed = true;
    const shrink = (L, keep) => {
      const before = domains[L].length;
      domains[L] = domains[L].filter(keep);
      if (domains[L].length !== before) changed = true;
      return domains[L].length > 0;
    };
    const roomsOf = (M) => new Set(domains[M].map((a) => a.room));
    const fixedRoom = (M) => { const s = roomsOf(M); return s.size === 1 ? [...s][0] : null; };

    while (changed) {
      changed = false;
      // 1. Letra fijada: nadie más en su fila, su columna ni su casilla.
      for (const L of letters) {
        if (domains[L].length !== 1) continue;
        const { r, c } = domains[L][0];
        for (const M of letters) {
          if (M !== L && !shrink(M, (b) => b.r !== r && b.c !== c)) return false;
        }
      }
      // 2. Pistas entre dos personas: cada casilla necesita algún apoyo en el dominio de la otra.
      for (const cl of clues) {
        if (!BINARY.has(cl.kind)) continue;
        const L = cl.letter, M = cl.other;
        const kind = cl.kind;
        if (!shrink(L, (a) => domains[M].some((b) => pairOK(kind, a, b)))) return false;
        if (!shrink(M, (b) => domains[L].some((a) => pairOK(kind, a, b)))) return false;
      }
      // 3. Habitaciones: «era la única persona de su habitación» y «la víctima estaba a solas con el asesino».
      for (const cl of clues) {
        if (cl.kind !== 'alone' && cl.kind !== 'victim') continue;
        const L = cl.letter;
        const others = letters.filter((M) => M !== L);
        const lr = fixedRoom(L);
        if (cl.kind === 'alone') {
          for (const M of others) {
            const mr = fixedRoom(M);
            if (mr !== null && !shrink(L, (a) => a.room !== mr)) return false;
          }
          if (lr !== null) for (const M of others) if (!shrink(M, (a) => a.room !== lr)) return false;
        } else if (lr !== null) {
          const inside = others.filter((M) => fixedRoom(M) === lr);
          const possible = others.filter((M) => roomsOf(M).has(lr));
          if (inside.length > 1 || possible.length === 0) return false;
          if (inside.length === 1) {
            for (const M of others) if (M !== inside[0] && !shrink(M, (a) => a.room !== lr)) return false;
          } else if (possible.length === 1 && !shrink(possible[0], (a) => a.room === lr)) return false;
        }
      }
      // 4. Con tantas personas como filas (o columnas), cada fila tiene exactamente una:
      //    si solo una letra puede estar en una fila, está en ella.
      if (letters.length === p.rows) {
        for (let r = 0; r < p.rows; r++) {
          const can = letters.filter((L) => domains[L].some((a) => a.r === r));
          if (can.length === 0) return false;
          if (can.length === 1 && !shrink(can[0], (a) => a.r === r)) return false;
        }
      }
      if (letters.length === p.cols) {
        for (let c = 0; c < p.cols; c++) {
          const can = letters.filter((L) => domains[L].some((a) => a.c === c));
          if (can.length === 0) return false;
          if (can.length === 1 && !shrink(can[0], (a) => a.c === c)) return false;
        }
      }
    }
    return true;
  }

  const stats = { counts: 0, nodes: 0, phase: '', byPhase: {} }; // solo para medir en las pruebas
  function countSolutions(p, clues, world, limit) {
    const letters = p.letters;
    let count = 0;
    stats.counts++;
    const t0 = Date.now();
    function search(domains) {
      stats.nodes++;
      if (count >= limit || !propagate(p, clues, world, domains)) return;
      const open = letters.filter((L) => domains[L].length > 1);
      if (!open.length) {
        const sol = Object.fromEntries(letters.map((L) => [L, [domains[L][0].r, domains[L][0].c]]));
        if (clues.every((cl) => clueTest(cl, sol, world) !== false)) count++;
        return;
      }
      open.sort((a, b) => domains[a].length - domains[b].length); // ramifica por la letra con menos opciones
      const L = open[0];
      for (const cell of domains[L]) {
        const next = {};
        for (const M of letters) next[M] = M === L ? [cell] : domains[M].slice();
        search(next);
        if (count >= limit) return;
      }
    }
    search(initialDomains(p, clues, world));
    stats.byPhase[stats.phase] = (stats.byPhase[stats.phase] || 0) + (Date.now() - t0);
    return count;
  }

  /** Cuánto se resuelve «sin ramificar»: letras fijadas y casillas posibles que quedan tras propagar. */
  function easeScore(p, clues, world) {
    const domains = initialDomains(p, clues, world);
    propagate(p, clues, world, domains);
    return {
      fixed: p.letters.filter((L) => domains[L].length === 1).length,
      open: p.letters.reduce((s, L) => s + domains[L].length, 0),
    };
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

  // Pesos para elegir pistas: las que relacionan a dos personas o describen la casilla obligan a
  // cruzar información; «estaba en la biblioteca» regala la respuesta y casi no se usa.
  const KIND_WEIGHT = {
    sameRoom: 6, otherRoom: 4, adjacent: 4, on: 4, window: 4, alone: 4, notRoom: 3,
    north: 1, south: 1, west: 1, east: 1, notOn: 2, notWindow: 2, room: 1,
  };
  // Al podar se intenta quitar antes lo directo (y luego la orientación, que cansa si abunda),
  // para que sobrevivan las pistas que hay que cruzar entre personas.
  const PRUNE_FIRST = ['room', 'adjacent', 'on', 'window', 'alone', 'notRoom', 'notOn', 'notWindow', 'north', 'south', 'west', 'east'];

  // El peso es por tipo, no por pista: cada letra tiene doce verdades de orientación y una o dos de
  // habitación, así que sin repartirlo la orientación acapararía la elección.
  function weightedPick(list, rnd) {
    const perKind = {};
    for (const cl of list) perKind[cl.kind] = (perKind[cl.kind] || 0) + 1;
    const w = (cl) => (KIND_WEIGHT[cl.kind] || 1) / perKind[cl.kind];
    const total = list.reduce((s, cl) => s + w(cl), 0);
    let x = rnd() * total;
    for (const cl of list) {
      x -= w(cl);
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

    stats.phase = 'add';
    let solutions = countSolutions(p, clues, world, 2);
    let guard = 0;
    stats.rounds = 0;
    while (solutions !== 1 && guard++ < 40) {
      stats.rounds++;
      if (solutions === 0) return null; // no debería pasar: las pistas son verdades
      const candidates = [];
      for (const L of [...suspects, 'V']) {
        for (const cl of (L === 'V' ? victimPool : pools[L])) {
          if (!clues.some((c) => sameKey(c, cl))) candidates.push(cl);
        }
      }
      if (!candidates.length) return null;
      // Entre las pistas que descartan alguna solución, una al azar según su peso: no la que más
      // recorta, para que el caso no se resuelva leyendo pista a pista.
      const CAP = 24;
      const current = countSolutions(p, clues, world, CAP);
      if (current >= CAP) {
        // Aún quedan muchísimas soluciones: cualquier pista verdadera ayuda, no hace falta medir.
        clues.push(weightedPick(candidates, rnd));
        solutions = countSolutions(p, clues, world, 2);
        continue;
      }
      const useful = [];
      for (const cl of shuffle(candidates, rnd)) {
        const n = countSolutions(p, [...clues, cl], world, current);
        if (n < current) useful.push({ cl, n });
        if (useful.length >= 3) break;
      }
      if (!useful.length) return null; // ninguna verdad pendiente distingue las soluciones que quedan
      const chosen = weightedPick(useful.map((u) => u.cl), rnd);
      clues.push(chosen);
      solutions = Math.min(useful.find((u) => u.cl === chosen).n, 2);
    }
    if (solutions !== 1) return null;

    stats.phase = 'prune';
    // Poda: quita pistas redundantes (las directas primero) manteniendo al menos una por sospechoso.
    const order = clues
      .map((cl, i) => ({ cl, i }))
      .filter(({ i }) => i > 0)
      .sort((a, b) => {
        const ra = PRUNE_FIRST.indexOf(a.cl.kind), rb = PRUNE_FIRST.indexOf(b.cl.kind);
        return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb) || b.i - a.i;
      });
    for (const { cl } of order) {
      const remainingForLetter = clues.filter((c) => c !== cl && c.letter === cl.letter && c.kind !== 'victim').length;
      if (cl.letter !== 'V' && remainingForLetter === 0) continue;
      const trial = clues.filter((c) => c !== cl);
      if (countSolutions(p, trial, world, 2) === 1) clues = trial;
    }
    return clues;
  }

  /* ---------- Generación completa ---------- */
  function letterName(L) { return L; }

  const DEFAULT_SIZE = 7;   // 7×7: seis sospechosos y la víctima
  const CANDIDATES = 3;     // casos válidos que se generan por día; se publica el más difícil (ver generate)

  function buildPuzzle(seedText, attempt, rows, cols) {
    const rnd = mulberry32(hashString(`${seedText}#${attempt}`));
    const { rooms, cellRoom } = makeRooms(rows, cols, randInt(Math.min(6, rows - 1), Math.min(7, rows), rnd), rnd);
    const { furniture, rugs, windows } = furnish(rows, cols, rooms, cellRoom, rnd);
    const count = Math.min(rows, cols);
    const letters = [];
    for (let i = 0; i < count - 1; i++) letters.push(String.fromCharCode(65 + i));
    letters.push('V');
    const p = { rows, cols, rooms, cellRoom, furniture, rugs, windows, letters };
    const world = makeWorld(p);
    if (world.openCells.length < count * 2) return null;
    const sol = randomSolution(p, world, rnd);
    if (!sol) return null;
    const roomsById = Object.fromEntries(rooms.map((rm) => [rm.id, rm]));
    const clues = chooseClues(p, sol, world, roomsById, rnd);
    if (!clues) return null;

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
      ease: (stats.phase = 'ease', easeScore(p, clues, world)),
      attempt,
    };
  }

  function generate(seedText, opts = {}) {
    const rows = opts.rows || DEFAULT_SIZE, cols = opts.cols || DEFAULT_SIZE;
    const found = [];
    for (let attempt = 0; attempt < 60 && found.length < (opts.candidates || CANDIDATES); attempt++) {
      const p = buildPuzzle(seedText, attempt, rows, cols);
      if (p) found.push(p);
    }
    if (!found.length) return null;
    // El más difícil que aún da un punto de apoyo: se prefiere que la deducción directa fije una o dos
    // personas (y deje el resto para razonar) antes que ninguna; a igualdad, más casillas abiertas.
    const rank = (e) => (e.fixed === 0 ? 2.5 : e.fixed);
    found.sort((a, b) => rank(a.ease) - rank(b.ease) || b.ease.open - a.ease.open);
    return found[0];
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

  const api = { generate, dateKey, puzzleNumber, countSolutions, easeScore, makeWorld, OBSTACLES, DAILY_EPOCH, internals: { stats, makeRooms, furnish, randomSolution, truthsFor, initialDomains, propagate, clueTest, mulberry32, hashString } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CrimleDaily = api;
})(typeof window !== 'undefined' ? window : globalThis);
