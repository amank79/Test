// Game controller: rendering loop, input, overworld logic, menus, save/load.
const SAVE_KEY = 'monster-quest-3d-save';
const ZONE_NAMES = { town: 'Sunnyvale Town', meadow: 'Route 1 · Breezy Meadow', forest: 'Whisperwood Forest', rocky: 'Rocky Heights' };

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd8ff);
    this.scene.fog = new THREE.Fog(0x9fd8ff, 16, 34);
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x557744, 0.75));
    this.sun = new THREE.DirectionalLight(0xfff4e0, 0.85);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
    this.scene.add(this.sun, this.sun.target);

    this.world = new World(this.scene);
    this.sound = new Sound();
    this.tweens = [];
    this.mode = 'title';   // title | intro | overworld | battle | cutscene
    this.held = null;       // currently held direction
    this.running = false;
    this.clock = new THREE.Clock();
    this.lastZone = null;
    this.stepsSinceEncounter = 0;

    addEventListener('resize', () => this.resize());
    this.setupInput();
    this.setupTouch();
    this.camPos = new THREE.Vector3();
    this.updateCamera(true);
    this.loop();
    this.titleScreen();
  }

  newState() {
    return { party: [], box: [], bag: { potion: 3, ball: 5 }, money: 1500, flags: {}, dex: {}, pos: { ...START_POS, dir: 'up' } };
  }

  // ---------- Core loop ----------
  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    for (const c of [this.camera, this.battle?.camera, this.introCam]) if (c) { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); }
  }

  tween(dur, fn) {
    return new Promise(resolve => this.tweens.push({ t: 0, dur, fn, resolve }));
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(0.05, this.clock.getDelta()), t = this.clock.elapsedTime;
    for (const tw of this.tweens.slice()) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.resolve(); }
    }
    if (this.mode === 'battle' && this.battle) {
      this.battle.update(dt, t);
      this.renderer.render(this.battle.scene, this.battle.camera);
      return;
    }
    if (this.mode === 'intro' && this.introScene) {
      this.updateIntro(dt, t);
      this.renderer.render(this.introScene, this.introCam);
      return;
    }
    const stepped = this.world.update(dt, t);
    if (this.mode === 'overworld') {
      if (stepped) this.onStep();
      if (!this.world.moving && !UI.busy && this.mode === 'overworld' && this.held) this.attemptMove(this.held);
      if (!UI.busy) this.world.updateNPCs(this.state);
    }
    if (this.mode === 'title') this.world.player.rotation.y += dt * 0.5;
    this.updateCamera(false, t);
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(snap, t = 0) {
    const p = this.world.player.position;
    const target = this.mode === 'title'
      ? new THREE.Vector3(p.x + Math.sin(t * 0.1) * 10, 9, p.z + Math.cos(t * 0.1) * 10)
      : new THREE.Vector3(p.x, p.y + 7.5, p.z + 6.5);
    if (snap) this.camPos.copy(target); else this.camPos.lerp(target, this.mode === 'title' ? 0.02 : 0.12);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(p.x, 0.5, p.z - (this.mode === 'title' ? 0 : 0.5));
    this.sun.position.set(p.x + 8, 18, p.z + 6);
    this.sun.target.position.set(p.x, 0, p.z);
  }

  // ---------- Input ----------
  setupInput() {
    const map = {
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      Space: 'a', Enter: 'a', KeyZ: 'a', KeyE: 'a', Escape: 'b', KeyX: 'b', Backspace: 'b', KeyQ: 'b', KeyM: 'menu', Tab: 'menu'
    };
    addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.running = true;
      const k = map[e.code];
      if (!k) return;
      e.preventDefault();
      this.press(k, e.repeat);
    });
    addEventListener('keyup', e => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.running = false;
      const k = map[e.code];
      if (k && k === this.held) this.held = null;
    });
    addEventListener('blur', () => { this.held = null; });
  }

  press(k, repeat) {
    this.sound.ensure();
    if (UI.busy) { if (!repeat) { if (['a', 'b', 'up', 'down', 'left', 'right'].includes(k)) this.sound.select(); UI.key(k); } return; }
    if (this.mode !== 'overworld') return;
    if (DIRS[k]) { this.held = k; return; }
    if (repeat) return;
    if (k === 'a') this.interact();
    else if (k === 'menu' || k === 'b') this.mainMenu();
  }

  setupTouch() {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) document.body.classList.add('touch');
    document.querySelectorAll('[data-key]').forEach(btn => {
      const k = btn.dataset.key;
      const down = e => { e.preventDefault(); btn.classList.add('down'); this.press(k, false); };
      const up = e => { e.preventDefault(); btn.classList.remove('down'); if (this.held === k) this.held = null; };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('pointercancel', up);
    });
    $('mute-btn').onclick = () => {
      this.sound.muted = !this.sound.muted;
      $('mute-btn').textContent = this.sound.muted ? '🔇' : '🔊';
    };
  }

  // ---------- Title & intro ----------
  titleScreen() {
    const hasSave = !!localStorage.getItem(SAVE_KEY);
    $('title').classList.remove('hidden');
    $('continue-btn').disabled = !hasSave;
    $('new-btn').onclick = () => { this.sound.ensure(); $('title').classList.add('hidden'); this.startNew(); };
    $('continue-btn').onclick = () => { this.sound.ensure(); $('title').classList.add('hidden'); this.load(); };
  }

  async startNew() {
    this.state = this.newState();
    this.world.applyState(this.state);
    this.buildIntroScene();
    this.mode = 'intro';
    this.sound.music('overworld');
    await UI.say('PROF. OAKLEY: Welcome to the world of MONSTERS!');
    await UI.say('People and monsters live together here, battling and growing as partners.');
    await UI.say('Before your journey begins, choose your very first partner!');
    let pick = -1;
    while (pick < 0) {
      pick = await UI.menu(STARTERS.map(id => `${SPECIES[id].name} ${SPECIES[id].types.map(t => UI.typeBadge(t)).join('')}`), {
        title: 'Choose your starter', className: 'starter-menu',
        info: i => { this.introSel = i; return ['A fiery pup with a burning spirit. Strong vs Grass.', 'A bubbly blob of water. Strong vs Fire.', 'A hardy sprout that blooms with power. Strong vs Water.'][i]; }
      });
      const id = STARTERS[pick];
      const c = await UI.menu(['Yes', 'No'], { title: `Choose ${SPECIES[id].name}?` });
      if (c !== 0) pick = -1;
    }
    const mon = createMonster(STARTERS[pick], 5);
    this.state.party.push(mon);
    this.state.dex[mon.species] = 'caught';
    this.sound.levelUp();
    await UI.say(`You received ${monName(mon)}!`);
    await UI.say('Here are 5 Capture Orbs and 3 Potions. Head north through the tall grass to begin your adventure!');
    await UI.say('Tip: Arrow keys/WASD to move, Shift to run, Space to talk, M for the menu.');
    this.introScene = null;
    this.enterOverworld();
  }

  buildIntroScene() {
    const s = this.introScene = new THREE.Scene();
    s.background = new THREE.Color(0xe8eef0);
    s.add(new THREE.HemisphereLight(0xffffff, 0x888888, 0.9));
    const d = new THREE.DirectionalLight(0xffffff, 0.7); d.position.set(2, 6, 5); s.add(d);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), mat(0xc8d0d8));
    floor.rotation.x = -Math.PI / 2; s.add(floor);
    this.introMons = STARTERS.map((id, i) => {
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.5, 24), mat(0xffffff));
      ped.position.set((i - 1) * 2.4, 0.25, 0); s.add(ped);
      const m = buildMonsterMesh(id);
      m.position.set((i - 1) * 2.4, 0.5, 0);
      s.add(m);
      return m;
    });
    this.introSel = -1;
    this.introCam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
    this.introCam.position.set(0, 2.6, 6.5);
    this.introCam.lookAt(0, 0.9, 0);
  }

  updateIntro(dt, t) {
    this.introMons.forEach((m, i) => {
      animateMonster(m, t);
      const sel = i === this.introSel;
      m.rotation.y = sel ? Math.sin(t * 2) * 0.6 : 0;
      m.position.y = 0.5 + (sel ? Math.abs(Math.sin(t * 5)) * 0.25 : 0);
    });
  }

  enterOverworld() {
    this.mode = 'overworld';
    this.world.px = this.state.pos.x; this.world.pz = this.state.pos.z; this.world.dir = this.state.pos.dir || 'up';
    this.world.placePlayer();
    this.world.applyState(this.state);
    this.updateCamera(true);
    this.sound.music('overworld');
    $('hud').classList.remove('hidden');
    UI.updateHud(this.state);
    this.checkZone();
  }

  // ---------- Overworld logic ----------
  zone() { return this.world.pz >= 32 ? 'town' : this.world.zoneAt(this.world.pz); }

  checkZone() {
    const z = this.zone();
    if (z !== this.lastZone) { this.lastZone = z; UI.toast(ZONE_NAMES[z]); }
  }

  attemptMove(dir) {
    const r = this.world.tryMove(dir, this.state, this.running);
    if (r === 'blocked') {
      const now = performance.now();
      if (!this._lastBump || now - this._lastBump > 300) { this.sound.bump(); this._lastBump = now; }
    }
  }

  async onStep() {
    const w = this.world;
    this.state.pos = { x: w.px, z: w.pz, dir: w.dir };
    this.checkZone();
    const tr = w.spottingTrainer(this.state);
    if (tr) return this.trainerApproach(tr);
    if (w.isTallGrass(w.px, w.pz)) {
      this.stepsSinceEncounter++;
      if (this.stepsSinceEncounter > 2 && Math.random() < 0.12) {
        this.stepsSinceEncounter = 0;
        const zone = w.zoneAt(w.pz);
        const table = ENCOUNTERS[zone];
        let r = Math.random() * table.reduce((s, e) => s + e[3], 0);
        const entry = table.find(e => (r -= e[3]) < 0) || table[0];
        const lv = entry[1] + Math.floor(Math.random() * (entry[2] - entry[1] + 1));
        const mon = createMonster(entry[0], lv);
        this.held = null;
        await this.startBattle({ wild: mon, zone });
      }
    }
  }

  async trainerApproach(n) {
    this.mode = 'cutscene';
    this.held = null;
    const mesh = this.world.npcMeshes[n.id];
    mesh.userData.mark.visible = true;
    this.sound.spotted();
    await new Promise(r => setTimeout(r, 700));
    mesh.userData.mark.visible = false;
    const [dx, dz] = DIRS[n.dir];
    while (Math.abs(this.world.px - n.x) + Math.abs(this.world.pz - n.z) > 1) {
      const fx = n.x, fz = n.z;
      n.x += dx; n.z += dz;
      await this.tween(0.2, k => mesh.position.set(fx + dx * k, Math.sin(k * Math.PI) * 0.06, fz + dz * k));
    }
    // player faces trainer
    const face = Object.keys(DIRS).find(d => DIRS[d][0] === -dx && DIRS[d][1] === -dz);
    this.world.dir = face; this.world.placePlayer();
    await UI.say(`${n.name}: ${n.intro}`);
    const res = await this.startBattle({ trainer: n, zone: this.world.zoneAt(n.z) });
    // walk trainer back home
    n.x = n.homeX; n.z = n.homeZ;
    mesh.position.set(n.x, 0, n.z);
    if (res === 'win') this.state.flags['beat_' + n.id] = true;
  }

  async startBattle(opts) {
    this.mode = 'cutscene';
    this.sound.music('battle');
    // transition: flashing wipe
    const wipe = $('wipe');
    wipe.classList.add('on');
    await new Promise(r => setTimeout(r, 600));
    if (opts.wild) this.state.dex[opts.wild.species] = this.state.dex[opts.wild.species] || 'seen';
    this.battle = new Battle(this, opts);
    this.mode = 'battle';
    wipe.classList.remove('on');
    const result = await this.battle.run();
    this.battle = null;
    if (opts.trainer) opts.trainer.team.forEach(([s]) => { this.state.dex[s] = this.state.dex[s] || 'seen'; });
    if (result === 'lose') await this.blackout();
    else this.enterOverworld();
    if (opts.legendary && (result === 'caught' || result === 'win')) {
      this.state.flags.legendDone = true;
      this.world.applyState(this.state);
      if (result === 'win') await UI.say('VOLTAUR flew away into the clouds...');
      await UI.say('🏆 Congratulations! You conquered the Rocky Heights and met the legendary VOLTAUR! Thanks for playing!');
    }
    this.save(true);
    return result;
  }

  async blackout() {
    this.state.money = Math.floor(this.state.money / 2);
    this.state.party.forEach(healMonster);
    this.state.pos = { x: 7, z: 37, dir: 'down' };
    this.enterOverworld();
    await UI.say('You hurried back to the HEAL center, protecting your exhausted team...');
    await UI.say('NURSE: Your monsters are fully healed. Please be careful out there!');
  }

  async interact() {
    const w = this.world, { x, z } = w.facingTile();
    const npc = w.npcAt(x, z);
    if (npc) {
      const mesh = w.npcMeshes[npc.id];
      const back = Object.keys(DIRS).find(d => DIRS[d][0] === -DIRS[w.dir][0] && DIRS[d][1] === -DIRS[w.dir][1]);
      mesh.rotation.y = DIR_ANGLE[back];
      if (npc.trainer && !this.state.flags['beat_' + npc.id]) {
        this.held = null;
        await UI.say(`${npc.name}: ${npc.intro}`);
        const res = await this.startBattle({ trainer: npc, zone: w.zoneAt(npc.z) });
        if (res === 'win') this.state.flags['beat_' + npc.id] = true;
      } else if (npc.trainer) {
        await UI.say(`${npc.name}: ${npc.defeat}`);
      } else {
        for (const line of npc.lines) await UI.say(line);
      }
      mesh.rotation.y = DIR_ANGLE[npc.dir];
      return;
    }
    const pick = PICKUPS.find(p => p.x === x && p.z === z && !this.state.flags['pick_' + p.id]);
    if (pick) {
      this.state.flags['pick_' + pick.id] = true;
      this.state.bag[pick.item] = (this.state.bag[pick.item] || 0) + pick.qty;
      w.applyState(this.state);
      this.sound.pickup();
      await UI.say(`You found ${pick.qty}x ${ITEMS[pick.item].name}!`);
      return;
    }
    if (!this.state.flags.legendDone && x === LEGENDARY.x && z === LEGENDARY.z) {
      if (!this.state.flags.beat_rhea) { await UI.say('A crackling barrier of lightning surrounds the Storm Bird...'); return; }
      await UI.say('Kyaaaooo!! The air crackles with electricity!');
      this.held = null;
      await this.startBattle({ wild: createMonster(LEGENDARY.species, LEGENDARY.level), zone: 'rocky', legendary: true });
      return;
    }
    const b = BUILDINGS.find(b => b.doorX === x && b.doorZ === z);
    if (b) return this.enterBuilding(b);
    if (w.tile(x, z) === 'W') await UI.say('The water is deep and sparkling blue.');
  }

  async enterBuilding(b) {
    if (b.id === 'center' || b.id === 'home') {
      await UI.say(b.id === 'center' ? 'NURSE: Welcome to the HEAL center! Let me restore your monsters.' : 'MOM: Welcome home, sweetie! Take a rest.');
      this.state.party.forEach(healMonster);
      this.sound.heal();
      UI.flash('#ffe0f0', 800);
      UI.updateHud(this.state);
      await UI.say('Your monsters are fully healed! Game saved.');
      this.save(true);
    } else if (b.id === 'shop') {
      await this.shop();
    } else if (b.id === 'lab') {
      const caught = Object.values(this.state.dex).filter(v => v === 'caught').length;
      const seen = Object.keys(this.state.dex).length;
      await UI.say(`PROF. OAKLEY: Your MonDex shows ${seen} seen and ${caught} caught out of ${Object.keys(SPECIES).length}.`);
      await UI.say(caught >= 8 ? 'Incredible research! You are a true Monster Master!' : 'Keep exploring and catching monsters!');
    }
  }

  async shop() {
    const stock = ['ball', 'greatball', 'potion', 'superpot', 'revive'];
    await UI.say('CLERK: Welcome! How may I help you?');
    while (true) {
      const i = await UI.menu(stock.map(id => `${ITEMS[id].name} <small>₽${ITEMS[id].price}</small>`),
        { title: `Buy · You have ₽${this.state.money}`, cancel: true, info: k => ITEMS[stock[k]].desc + ` (Owned: ${this.state.bag[stock[k]] || 0})` });
      if (i < 0) break;
      const id = stock[i], price = ITEMS[id].price;
      const qtys = [1, 5, 10].filter(q => q * price <= this.state.money);
      if (!qtys.length) { await UI.say("You don't have enough money."); continue; }
      const q = await UI.menu(qtys.map(q => `x${q} — ₽${q * price}`), { title: `How many ${ITEMS[id].name}?`, cancel: true });
      if (q < 0) continue;
      this.state.money -= qtys[q] * price;
      this.state.bag[id] = (this.state.bag[id] || 0) + qtys[q];
      this.sound.pickup();
      UI.updateHud(this.state);
      await UI.say(`Bought ${qtys[q]}x ${ITEMS[id].name}. Thank you!`);
    }
    await UI.say('CLERK: Please come again!');
  }

  // ---------- Menus ----------
  async mainMenu() {
    this.held = null;
    while (true) {
      const i = await UI.menu(['🐾 Team', '🎒 Bag', '📖 MonDex', '💾 Save', '❓ Controls', '✕ Close'], { title: 'Menu', cancel: true, className: 'side-menu' });
      if (i < 0 || i === 5) break;
      if (i === 0) await this.teamMenu();
      else if (i === 1) await this.bagMenu();
      else if (i === 2) await this.dexMenu();
      else if (i === 3) { this.save(); await UI.say('Your progress has been saved!'); }
      else if (i === 4) await UI.say('Move: Arrows/WASD · Run: Shift · Talk/Confirm: Space/Enter/Z · Back: Esc/X · Menu: M. Walk into tall grass to find wild monsters!');
    }
    UI.updateHud(this.state);
  }

  partyMenu(title, cancel) {
    return UI.menu(this.state.party.map(m => UI.monLine(m)), { title, cancel, className: 'party-menu' });
  }

  async teamMenu() {
    while (true) {
      const i = await this.partyMenu('Your Team', true);
      if (i < 0) return;
      const m = this.state.party[i];
      const c = await UI.menu(['Summary', 'Move to front', 'Release'], { title: monName(m), cancel: true });
      if (c === 0) await this.summary(m);
      else if (c === 1) { this.state.party.splice(i, 1); this.state.party.unshift(m); }
      else if (c === 2) {
        if (this.state.party.length <= 1) { await UI.say("You can't release your last monster!"); continue; }
        const y = await UI.menu(['No', 'Yes'], { title: `Really release ${monName(m)}?` });
        if (y === 1) { this.state.party.splice(i, 1); await UI.say(`Bye bye, ${monName(m)}!`); }
      }
    }
  }

  async summary(m) {
    const sp = SPECIES[m.species];
    const next = xpForLevel(m.level + 1) - m.xp;
    const html = `<div class="summary">${UI.monLine(m)}
      <div class="stats">ATK <b>${m.atk}</b> · DEF <b>${m.def}</b> · SPD <b>${m.spd}</b> · EXP to next: <b>${next}</b></div>
      ${sp.evolve ? `<div class="stats">Evolves into ${SPECIES[sp.evolve.into].name} at Lv${sp.evolve.level}</div>` : ''}
      <div class="moves">${m.moves.map(x => `<div>${UI.typeBadge(MOVES[x.id].type)} ${MOVES[x.id].name} <small>${x.pp}/${MOVES[x.id].pp} PP · Pow ${MOVES[x.id].power || '—'}</small></div>`).join('')}</div></div>`;
    await UI.menu([html], { title: 'Summary', cancel: true, className: 'summary-menu' });
  }

  async bagMenu() {
    while (true) {
      const ids = Object.keys(this.state.bag).filter(k => this.state.bag[k] > 0);
      if (!ids.length) { await UI.say('Your bag is empty.'); return; }
      const i = await UI.menu(ids.map(id => `${ITEMS[id].name} <small>x${this.state.bag[id]}</small>`), { title: 'Bag', cancel: true, info: k => ITEMS[ids[k]].desc });
      if (i < 0) return;
      const id = ids[i];
      if (ITEMS[id].ball) { await UI.say('Use Capture Orbs during wild battles!'); continue; }
      const t = await this.partyMenu(`Use ${ITEMS[id].name} on?`, true);
      if (t >= 0) await this.applyItem(id, this.state.party[t]);
    }
  }

  // Returns true if the item was consumed
  async applyItem(id, m) {
    const it = ITEMS[id];
    if (it.revive) {
      if (m.hp > 0) { await UI.say("It won't have any effect."); return false; }
      m.hp = Math.floor(m.maxHp / 2);
    } else if (it.heal) {
      if (m.hp <= 0 || m.hp >= m.maxHp) { await UI.say("It won't have any effect."); return false; }
      const before = m.hp;
      m.hp = Math.min(m.maxHp, m.hp + it.heal);
      this.state.bag[id]--;
      this.sound.heal();
      await UI.say(`${monName(m)} recovered ${m.hp - before} HP!`);
      UI.updateHud(this.state);
      return true;
    }
    this.state.bag[id]--;
    this.sound.heal();
    await UI.say(`${monName(m)} was revived!`);
    UI.updateHud(this.state);
    return true;
  }

  async dexMenu() {
    const ids = Object.keys(SPECIES);
    const rows = ids.map((id, i) => {
      const st = this.state.dex[id];
      const n = String(i + 1).padStart(3, '0');
      return st ? `${st === 'caught' ? '●' : '○'} #${n} ${SPECIES[id].name} ${SPECIES[id].types.map(t => UI.typeBadge(t)).join('')}` : `&nbsp;&nbsp; #${n} ?????`;
    });
    await UI.menu(rows, { title: `MonDex — Caught ${Object.values(this.state.dex).filter(v => v === 'caught').length}/${ids.length}`, cancel: true, className: 'dex-menu' });
  }

  // ---------- Save / Load ----------
  save(silent) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
      if (silent) UI.toast('Game saved');
    } catch (e) { /* storage unavailable */ }
  }

  load() {
    try {
      this.state = { ...this.newState(), ...JSON.parse(localStorage.getItem(SAVE_KEY)) };
      _uid = 1 + Math.max(0, ...this.state.party.concat(this.state.box).map(m => m.uid || 0));
    } catch (e) {
      return this.startNew();
    }
    if (!this.state.party.length) return this.startNew();
    // Beaten trainers stay put at home
    this.enterOverworld();
    UI.say('Welcome back! Your adventure continues.');
  }
}

window.addEventListener('load', () => { window.game = new Game(); });
