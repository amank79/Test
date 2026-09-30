// Monster instances: stats, leveling, damage, and procedural 3D models.
let _uid = 1;

function calcStat(base, level, isHp) {
  return isHp ? Math.floor((base * 2 * level) / 100) + level + 10
              : Math.floor((base * 2 * level) / 100) + 5;
}

function xpForLevel(level) { return Math.floor(Math.pow(level, 3) * 0.8); }

function createMonster(speciesId, level) {
  const m = { uid: _uid++, species: speciesId, level, xp: xpForLevel(level), moves: [], status: null };
  recalcStats(m);
  m.hp = m.maxHp;
  const sp = SPECIES[speciesId];
  const learned = sp.learnset.filter(([lv]) => lv <= level).map(([, id]) => id);
  const unique = [...new Set(learned)].slice(-4);
  m.moves = unique.map(id => ({ id, pp: MOVES[id].pp }));
  return m;
}

function recalcStats(m) {
  const b = SPECIES[m.species].base;
  const oldMax = m.maxHp || 0;
  m.maxHp = calcStat(b.hp, m.level, true);
  m.atk = calcStat(b.atk, m.level);
  m.def = calcStat(b.def, m.level);
  m.spd = calcStat(b.spd, m.level);
  if (m.hp !== undefined && m.hp > 0) m.hp = Math.min(m.maxHp, m.hp + (m.maxHp - oldMax));
}

function monName(m) { return m.nickname || SPECIES[m.species].name; }

function stageMult(s) { return s >= 0 ? (2 + s) / 2 : 2 / (2 - s); }

// Returns { damage, mult, crit, miss }
function computeDamage(att, def, moveId, attStages, defStages) {
  const mv = MOVES[moveId];
  if (Math.random() * 100 >= mv.acc) return { miss: true, damage: 0, mult: 1 };
  if (mv.kind === 'status') return { damage: 0, mult: 1 };
  const aSp = SPECIES[att.species], dSp = SPECIES[def.species];
  const mult = typeMultiplier(mv.type, dSp.types);
  const stab = aSp.types.includes(mv.type) ? 1.5 : 1;
  const crit = Math.random() < 1 / 16;
  const A = att.atk * stageMult(attStages.atk || 0);
  const D = def.def * stageMult(defStages.def || 0);
  const rand = 0.85 + Math.random() * 0.15;
  let dmg = ((((2 * att.level) / 5 + 2) * mv.power * (A / D)) / 50 + 2) * stab * mult * rand * (crit ? 1.5 : 1);
  dmg = mult === 0 ? 0 : Math.max(1, Math.floor(dmg));
  return { damage: dmg, mult, crit };
}

// Adds XP; returns array of events: {type:'level', level} | {type:'learn', move} | {type:'evolve', from, into}
function gainXp(m, amount) {
  const events = [];
  m.xp += amount;
  while (m.level < 100 && m.xp >= xpForLevel(m.level + 1)) {
    m.level++;
    recalcStats(m);
    events.push({ type: 'level', level: m.level });
    const sp = SPECIES[m.species];
    for (const [lv, id] of sp.learnset) {
      if (lv === m.level && !m.moves.some(x => x.id === id)) {
        if (m.moves.length >= 4) {
          // forget the weakest move to make room
          const weakest = m.moves.reduce((w, x) => (MOVES[x.id].power < MOVES[w.id].power ? x : w));
          m.moves.splice(m.moves.indexOf(weakest), 1);
        }
        m.moves.push({ id, pp: MOVES[id].pp });
        events.push({ type: 'learn', move: id });
      }
    }
    if (sp.evolve && m.level >= sp.evolve.level) {
      const from = m.species;
      m.species = sp.evolve.into;
      recalcStats(m);
      events.push({ type: 'evolve', from, into: m.species });
    }
  }
  return events;
}

function healMonster(m) {
  m.hp = m.maxHp;
  m.status = null;
  m.moves.forEach(x => { x.pp = MOVES[x.id].pp; });
}

// ---------- Procedural monster meshes ----------
function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...opts });
}

function addEyes(group, y, z, spread, size = 0.09) {
  const white = mat(0xffffff), black = mat(0x111111);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 10), white);
    e.position.set(s * spread, y, z);
    const p = new THREE.Mesh(new THREE.SphereGeometry(size * 0.55, 10, 8), black);
    p.position.set(0, 0, size * 0.6);
    e.add(p);
    group.add(e);
  }
}

function buildMonsterMesh(speciesId) {
  const sp = SPECIES[speciesId];
  const g = new THREE.Group();
  const body = mat(sp.color), acc = mat(sp.accent);
  const S = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    g.add(mesh); return mesh;
  };
  const sph = (r) => new THREE.SphereGeometry(r, 18, 14);

  switch (sp.shape) {
    case 'quad': {
      S(sph(0.45), body, 0, 0.55, 0, 1, 0.85, 1.3);
      S(sph(0.35), body, 0, 0.95, 0.5);
      S(new THREE.ConeGeometry(0.12, 0.35, 8), acc, -0.2, 1.3, 0.45);
      S(new THREE.ConeGeometry(0.12, 0.35, 8), acc, 0.2, 1.3, 0.45);
      S(sph(0.12), acc, 0, 0.88, 0.82);
      for (const [x, z] of [[-0.25, 0.35], [0.25, 0.35], [-0.25, -0.35], [0.25, -0.35]])
        S(new THREE.CylinderGeometry(0.09, 0.1, 0.35, 8), body, x, 0.17, z);
      const tail = S(new THREE.ConeGeometry(0.12, 0.6, 8), acc, 0, 0.8, -0.65);
      tail.rotation.x = -0.9;
      addEyes(g, 1.02, 0.78, 0.14);
      break;
    }
    case 'blob': {
      S(sph(0.55), body, 0, 0.55, 0, 1, 0.9, 1);
      S(sph(0.3), acc, 0, 0.45, 0.32, 1, 1, 0.6);
      S(sph(0.14), body, -0.45, 0.35, 0.15);
      S(sph(0.14), body, 0.45, 0.35, 0.15);
      S(new THREE.ConeGeometry(0.1, 0.3, 8), acc, 0, 1.12, 0);
      addEyes(g, 0.75, 0.45, 0.18, 0.1);
      break;
    }
    case 'bulb': {
      S(sph(0.45), body, 0, 0.5, 0, 1.1, 0.85, 1.1);
      S(sph(0.3), body, 0, 0.72, 0.42);
      const bud = S(sph(0.32), acc, 0, 1.0, -0.15, 1, 1.3, 1);
      for (let i = 0; i < 4; i++) {
        const leaf = S(new THREE.ConeGeometry(0.12, 0.55, 6), mat(0x2f7d2f), 0, 0.95, -0.15);
        leaf.rotation.z = Math.cos(i * Math.PI / 2) * 1.1;
        leaf.rotation.x = Math.sin(i * Math.PI / 2) * 1.1;
      }
      bud.userData.bob = true;
      for (const [x, z] of [[-0.3, 0.3], [0.3, 0.3], [-0.3, -0.3], [0.3, -0.3]])
        S(new THREE.CylinderGeometry(0.1, 0.12, 0.25, 8), body, x, 0.12, z);
      addEyes(g, 0.8, 0.68, 0.13);
      break;
    }
    case 'rock': {
      S(new THREE.DodecahedronGeometry(0.55, 0), body, 0, 0.55, 0);
      S(new THREE.DodecahedronGeometry(0.2, 0), acc, -0.55, 0.45, 0.1);
      S(new THREE.DodecahedronGeometry(0.2, 0), acc, 0.55, 0.45, 0.1);
      S(new THREE.DodecahedronGeometry(0.18, 0), acc, 0.1, 1.05, -0.1);
      addEyes(g, 0.7, 0.48, 0.17, 0.08);
      break;
    }
    case 'bird': {
      S(sph(0.4), body, 0, 0.75, 0, 1, 1, 1.2);
      S(sph(0.28), body, 0, 1.2, 0.3);
      S(sph(0.25), acc, 0, 0.65, 0.25, 1, 1.1, 0.6);
      const beak = S(new THREE.ConeGeometry(0.08, 0.25, 8), mat(0xffa020), 0, 1.15, 0.62);
      beak.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) {
        const w = S(sph(0.3), body, s * 0.45, 0.85, -0.05, 0.25, 0.8, 1.2);
        w.rotation.z = s * 0.5; w.userData.wing = s;
      }
      const tail = S(new THREE.ConeGeometry(0.15, 0.4, 6), acc, 0, 0.7, -0.55);
      tail.rotation.x = -1.2;
      for (const s of [-1, 1]) S(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 6), mat(0xffa020), s * 0.15, 0.2, 0);
      addEyes(g, 1.28, 0.52, 0.12, 0.07);
      break;
    }
    case 'worm': {
      for (let i = 0; i < 5; i++) S(sph(0.26 - i * 0.02), i % 2 ? acc : body, 0, 0.26 + (i === 0 ? 0.15 : 0), 0.35 - i * 0.3);
      S(new THREE.ConeGeometry(0.05, 0.25, 6), acc, -0.1, 0.72, 0.4);
      S(new THREE.ConeGeometry(0.05, 0.25, 6), acc, 0.1, 0.72, 0.4);
      addEyes(g, 0.48, 0.58, 0.1, 0.07);
      break;
    }
  }
  const sc = sp.scale || 1;
  g.scale.setScalar(sc);
  g.userData.speciesId = speciesId;
  return g;
}

function animateMonster(g, t) {
  g.children.forEach(c => {
    if (c.userData.wing) c.rotation.z = c.userData.wing * (0.5 + Math.sin(t * 10) * 0.5);
    if (c.userData.bob) c.position.y = 1.0 + Math.sin(t * 3) * 0.04;
  });
}
