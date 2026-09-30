// Overworld: builds the 3D map, player, NPCs and handles grid movement.
const MAP_W = MAP[0].length, MAP_H = MAP.length;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR_ANGLE = { up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 };

const TILE_COLORS = {
  '.': '#79c257', ',': '#5aa845', ';': '#3f8a3a', ':': '#9a8f68', 'T': '#3b7a33', '#': '#8f8a7a',
  'W': '#3a78c8', 'P': '#d8c08a', 'F': '#79c257', 'R': '#b5a57e'
};

class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.blocked = [];
    for (let z = 0; z < MAP_H; z++) {
      this.blocked.push([]);
      for (let x = 0; x < MAP_W; x++) this.blocked[z].push('T#W'.includes(MAP[z][x]));
    }
    this.buildGround();
    this.buildProps();
    this.buildBuildings();
    this.npcMeshes = {};
    this.pickupMeshes = {};
    this.buildNPCs();
    this.buildPickups();
    this.buildLegendary();
    this.player = this.makeCharacter(0xe03030, 0x302018, true);
    this.root.add(this.player);
    this.px = START_POS.x; this.pz = START_POS.z; this.dir = 'up';
    this.moving = null;
    this.placePlayer();
  }

  tile(x, z) { return (z >= 0 && z < MAP_H && x >= 0 && x < MAP_W) ? MAP[z][x] : 'T'; }
  isTallGrass(x, z) { return ',;:'.includes(this.tile(x, z)); }
  zoneAt(z) { return z <= 9 ? 'rocky' : z <= 20 ? 'forest' : 'meadow'; }

  buildGround() {
    const px = 16, c = document.createElement('canvas');
    c.width = MAP_W * px; c.height = MAP_H * px;
    const ctx = c.getContext('2d');
    for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
      const t = MAP[z][x];
      ctx.fillStyle = TILE_COLORS[t] || '#79c257';
      ctx.fillRect(x * px, z * px, px, px);
      // subtle noise for texture
      ctx.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.06) + ')';
      ctx.fillRect(x * px + (Math.random() * 12 | 0), z * px + (Math.random() * 12 | 0), 3, 3);
      if (t === 'P') { ctx.fillStyle = 'rgba(120,90,40,0.15)'; ctx.fillRect(x * px + 3, z * px + 5, 2, 2); }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W, MAP_H), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(MAP_W / 2 - 0.5, 0, MAP_H / 2 - 0.5);
    plane.receiveShadow = true;
    this.root.add(plane);
  }

  instanced(geo, material, positions, setup) {
    if (!positions.length) return null;
    const im = new THREE.InstancedMesh(geo, material, positions.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    positions.forEach((pos, i) => {
      const o = setup(pos, i);
      p.set(o.x, o.y, o.z);
      q.setFromEuler(new THREE.Euler(0, o.ry || 0, 0));
      s.set(o.sx || 1, o.sy || 1, o.sz || 1);
      m.compose(p, q, s);
      im.setMatrixAt(i, m);
    });
    im.castShadow = true; im.receiveShadow = true;
    this.root.add(im);
    return im;
  }

  buildProps() {
    const trees = [], grass = [], water = [], fences = [], boulders = [], flowers = [];
    for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
      const t = MAP[z][x];
      if (t === 'T') trees.push({ x, z, r: Math.random() });
      else if (',;:'.includes(t)) for (let k = 0; k < 4; k++) grass.push({ x: x + (k % 2 - 0.5) * 0.45, z: z + ((k >> 1) - 0.5) * 0.45, t });
      else if (t === 'W') water.push({ x, z });
      else if (t === '#') (z < 10 ? boulders : fences).push({ x, z });
      else if (t === 'F') for (let k = 0; k < 3; k++) flowers.push({ x: x + (Math.random() - 0.5) * 0.7, z: z + (Math.random() - 0.5) * 0.7 });
    }
    // Trees: trunk + two foliage cones
    this.instanced(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 6), mat(0x6b4a2b), trees, p => ({ x: p.x, y: 0.3, z: p.z }));
    this.instanced(new THREE.ConeGeometry(0.55, 1.0, 7), mat(0x2f7a3a), trees, p => ({ x: p.x, y: 0.95, z: p.z, sx: 0.9 + p.r * 0.3, sz: 0.9 + p.r * 0.3, ry: p.r * 6 }));
    this.instanced(new THREE.ConeGeometry(0.4, 0.8, 7), mat(0x3d9446), trees, p => ({ x: p.x, y: 1.45, z: p.z, ry: p.r * 6 }));
    // Tall grass tufts
    const grassColors = { ',': 0x3e9a3a, ';': 0x2c7a30, ':': 0x7f8a4a };
    for (const t of Object.keys(grassColors)) {
      const g = grass.filter(p => p.t === t);
      this.instanced(new THREE.ConeGeometry(0.16, 0.5, 4), mat(grassColors[t]), g, p => ({ x: p.x, y: 0.25, z: p.z, ry: Math.random() * 3 }));
    }
    // Water
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x3a8ae0, transparent: true, opacity: 0.85, roughness: 0.15, metalness: 0.2 });
    this.instanced(new THREE.BoxGeometry(1, 0.1, 1), this.waterMat, water, p => ({ x: p.x, y: 0.02, z: p.z }));
    // Fences & boulders
    this.instanced(new THREE.BoxGeometry(0.9, 0.5, 0.15), mat(0xeadbc0), fences, p => ({ x: p.x, y: 0.25, z: p.z }));
    this.instanced(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6), mat(0xc8b898), fences, p => ({ x: p.x - 0.45, y: 0.35, z: p.z }));
    this.instanced(new THREE.DodecahedronGeometry(0.55, 0), mat(0x7d776a, { flatShading: true }), boulders, p => ({ x: p.x, y: 0.4, z: p.z, ry: p.x * 1.7 + p.z, sy: 0.9 }));
    // Flowers
    const fcols = [0xff6080, 0xffe050, 0xffffff, 0xc070ff];
    fcols.forEach((c, i) => {
      const f = flowers.filter((_, k) => k % fcols.length === i);
      this.instanced(new THREE.SphereGeometry(0.08, 6, 5), mat(c), f, p => ({ x: p.x, y: 0.12, z: p.z }));
    });
  }

  labelSprite(text, color) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 48;
    const ctx = c.getContext('2d');
    ctx.fillStyle = color; ctx.fillRect(0, 0, 128, 48);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 26);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c) }));
    s.scale.set(1.3, 0.5, 1);
    return s;
  }

  buildBuildings() {
    for (const b of BUILDINGS) {
      for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) this.blocked[z][x] = true;
      const g = new THREE.Group();
      const cx = b.x + b.w / 2 - 0.5, cz = b.z + b.d / 2 - 0.5;
      const h = 1.8;
      const walls = new THREE.Mesh(new THREE.BoxGeometry(b.w - 0.1, h, b.d - 0.1), mat(b.wall));
      walls.position.set(cx, h / 2, cz); walls.castShadow = walls.receiveShadow = true; g.add(walls);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(b.w, b.d) * 0.78, 1.2, 4), mat(b.roof));
      roof.rotation.y = Math.PI / 4; roof.scale.set(b.w / Math.max(b.w, b.d), 1, b.d / Math.max(b.w, b.d));
      roof.position.set(cx, h + 0.6, cz); roof.castShadow = true; g.add(roof);
      const doorX = b.x + Math.floor(b.w / 2);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.1), mat(0x6a4020));
      door.position.set(doorX, 0.55, b.z + b.d - 0.5); g.add(door);
      for (const wx of [cx - b.w / 3.2, cx + b.w / 3.2]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.1), mat(0x9fd8ff, { emissive: 0x224466 }));
        win.position.set(wx, 1.15, b.z + b.d - 0.5); g.add(win);
      }
      if (b.label) {
        const s = this.labelSprite(b.label, '#' + b.roof.toString(16).padStart(6, '0'));
        s.position.set(doorX, 1.55, b.z + b.d - 0.4); g.add(s);
      }
      b.doorX = doorX; b.doorZ = b.z + b.d - 1;
      this.root.add(g);
    }
  }

  makeCharacter(shirt, hair, isPlayer) {
    const g = new THREE.Group();
    const skin = mat(0xffd8b0);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.55, 10), mat(shirt));
    body.position.y = 0.55; g.add(body);
    const legs = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.32, 6), mat(0x304070));
      leg.position.set(s * 0.1, 0.16, 0); g.add(leg); legs.push(leg);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6), mat(shirt));
      arm.position.set(s * 0.28, 0.58, 0); arm.rotation.z = s * 0.2; g.add(arm); legs.push(arm);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), skin);
    head.position.y = 1.02; g.add(head);
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.235, 14, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(hair));
    hairM.position.y = 1.04; g.add(hairM);
    if (isPlayer) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 14), mat(0xe03030));
      cap.position.y = 1.18; g.add(cap);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.22), mat(0xffffff));
      brim.position.set(0, 1.14, 0.25); g.add(brim);
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.15), mat(0xe0b020));
      pack.position.set(0, 0.6, -0.27); g.add(pack);
    }
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), mat(0x111111));
      eye.position.set(s * 0.08, 1.04, 0.2); g.add(eye);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.userData.limbs = legs;
    return g;
  }

  buildNPCs() {
    for (const n of NPCS) {
      const m = this.makeCharacter(n.color, n.hair, false);
      m.position.set(n.x, 0, n.z);
      m.rotation.y = DIR_ANGLE[n.dir];
      if (n.trainer) {
        const mark = this.labelSprite('!', '#e03030');
        mark.scale.set(0.5, 0.5, 1); mark.position.y = 1.7; mark.visible = false;
        m.add(mark); m.userData.mark = mark;
      }
      this.root.add(m);
      this.npcMeshes[n.id] = m;
      n.homeX = n.x; n.homeZ = n.z;
    }
  }

  buildPickups() {
    for (const p of PICKUPS) {
      const g = new THREE.Group();
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xe03030));
      const bot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0xffffff));
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 20), mat(0x222222));
      band.rotation.x = Math.PI / 2;
      g.add(top, bot, band);
      g.position.set(p.x, 0.25, p.z);
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      this.root.add(g);
      this.pickupMeshes[p.id] = g;
    }
  }

  buildLegendary() {
    this.legendMesh = buildMonsterMesh(LEGENDARY.species);
    this.legendMesh.position.set(LEGENDARY.x, 0, LEGENDARY.z);
    this.root.add(this.legendMesh);
    const light = new THREE.PointLight(0xfff080, 1.2, 5);
    light.position.set(0, 1.5, 0.5);
    this.legendMesh.add(light);
  }

  // Sync visibility with save state (collected pickups, caught legendary)
  applyState(state) {
    for (const p of PICKUPS) this.pickupMeshes[p.id].visible = !state.flags['pick_' + p.id];
    this.legendMesh.visible = !state.flags.legendDone;
  }

  placePlayer() {
    this.player.position.set(this.px, 0, this.pz);
    this.player.rotation.y = DIR_ANGLE[this.dir];
  }

  npcAt(x, z) {
    return NPCS.find(n => n.x === x && n.z === z);
  }

  canWalk(x, z, state) {
    if (this.tile(x, z) === 'T' || this.blocked[z]?.[x] !== false) return false;
    if (this.npcAt(x, z)) return false;
    if (PICKUPS.some(p => p.x === x && p.z === z && !state.flags['pick_' + p.id])) return false;
    if (!state.flags.legendDone && x === LEGENDARY.x && z === LEGENDARY.z) return false;
    return true;
  }

  // Start moving one tile. Returns 'moved' | 'turned' | 'blocked'
  tryMove(dir, state, run) {
    if (this.moving) return 'busy';
    const turned = this.dir !== dir;
    this.dir = dir;
    this.player.rotation.y = DIR_ANGLE[dir];
    const [dx, dz] = DIRS[dir];
    const nx = this.px + dx, nz = this.pz + dz;
    if (!this.canWalk(nx, nz, state)) return 'blocked';
    this.moving = { fx: this.px, fz: this.pz, tx: nx, tz: nz, t: 0, dur: run ? 0.12 : 0.2 };
    return turned ? 'moved' : 'moved';
  }

  facingTile() {
    const [dx, dz] = DIRS[this.dir];
    return { x: this.px + dx, z: this.pz + dz };
  }

  // Returns true when a step finished this frame
  update(dt, t) {
    let finished = false;
    if (this.moving) {
      const m = this.moving;
      m.t += dt / m.dur;
      const k = Math.min(1, m.t);
      this.player.position.x = m.fx + (m.tx - m.fx) * k;
      this.player.position.z = m.fz + (m.tz - m.fz) * k;
      this.player.position.y = Math.abs(Math.sin(k * Math.PI)) * 0.08;
      const swing = Math.sin(k * Math.PI * 2) * 0.6;
      this.player.userData.limbs.forEach((l, i) => { l.rotation.x = (i % 2 ? -1 : 1) * (i < 2 ? swing : -swing); });
      if (m.t >= 1) {
        this.px = m.tx; this.pz = m.tz; this.moving = null; finished = true;
        this.player.position.y = 0;
        this.player.userData.limbs.forEach(l => { l.rotation.x = 0; });
      }
    }
    if (this.waterMat) this.waterMat.color.setHSL(0.58, 0.65, 0.5 + Math.sin(t * 2) * 0.04);
    for (const p of PICKUPS) {
      const g = this.pickupMeshes[p.id];
      if (g.visible) { g.rotation.y = t * 1.5; g.position.y = 0.25 + Math.sin(t * 3 + p.x) * 0.05; }
    }
    if (this.legendMesh.visible) {
      this.legendMesh.position.y = 0.4 + Math.sin(t * 2) * 0.2;
      animateMonster(this.legendMesh, t);
    }
    return finished;
  }

  // Wandering NPCs shuffle occasionally
  updateNPCs(state) {
    for (const n of NPCS) {
      if (!n.wander || Math.random() > 0.01) continue;
      const dirs = Object.keys(DIRS);
      const d = dirs[Math.random() * 4 | 0];
      const [dx, dz] = DIRS[d];
      const nx = n.x + dx, nz = n.z + dz;
      n.dir = d;
      const mesh = this.npcMeshes[n.id];
      mesh.rotation.y = DIR_ANGLE[d];
      if (Math.abs(nx - n.homeX) <= 2 && Math.abs(nz - n.homeZ) <= 2 && this.canWalk(nx, nz, state) && !(nx === this.px && nz === this.pz) &&
          !(this.moving && nx === this.moving.tx && nz === this.moving.tz)) {
        n.x = nx; n.z = nz;
        mesh.position.set(nx, 0, nz);
      }
    }
  }

  // Returns a trainer NPC that can see the player, or null
  spottingTrainer(state) {
    for (const n of NPCS) {
      if (!n.trainer || state.flags['beat_' + n.id]) continue;
      const [dx, dz] = DIRS[n.dir];
      for (let i = 1; i <= n.sight; i++) {
        const x = n.x + dx * i, z = n.z + dz * i;
        if (this.blocked[z]?.[x] || this.tile(x, z) === 'T') break;
        if (x === this.px && z === this.pz) return n;
      }
    }
    return null;
  }
}
