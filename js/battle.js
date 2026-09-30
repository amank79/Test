// Turn-based battle system with its own 3D scene.
const TYPE_HEX = Object.fromEntries(Object.entries(TYPE_COLORS).map(([k, v]) => [k, parseInt(v.slice(1), 16)]));

class Battle {
  // opts: { wild: monster } or { trainer: npc }  | legendary: bool
  constructor(game, opts) {
    this.game = game;
    this.state = game.state;
    this.opts = opts;
    this.isWild = !!opts.wild;
    this.enemyTeam = this.isWild ? [opts.wild] : opts.trainer.team.map(([s, l]) => createMonster(s, l));
    this.enemyIdx = 0;
    this.enemy = this.enemyTeam[0];
    this.player = this.state.party.find(m => m.hp > 0);
    this.pStages = {}; this.eStages = {};
    this.participants = new Set();
    this.runAttempts = 0;
    this.buildScene();
  }

  // ---------- Scene ----------
  buildScene() {
    const s = this.scene = new THREE.Scene();
    const zone = this.opts.zone || 'meadow';
    const sky = { meadow: 0x9fd8ff, forest: 0x7fb89a, rocky: 0xc8b8a0, town: 0x9fd8ff }[zone];
    s.background = new THREE.Color(this.opts.legendary ? 0x302850 : sky);
    s.fog = new THREE.Fog(s.background, 12, 30);
    s.add(new THREE.HemisphereLight(0xffffff, 0x446633, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(3, 8, 5); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    s.add(sun);
    const groundCol = { meadow: 0x6ab04c, forest: 0x3f7a3a, rocky: 0xa89a74, town: 0x6ab04c }[zone];
    const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 40), mat(this.opts.legendary ? 0x4a4070 : groundCol));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; s.add(ground);
    const plat = (x, z) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.12, 32), mat(0xd8d0a0));
      p.position.set(x, 0.06, z); p.scale.z = 0.7; p.receiveShadow = true; s.add(p);
    };
    this.pPos = new THREE.Vector3(-1.9, 0.12, 1.4);
    this.ePos = new THREE.Vector3(1.9, 0.12, -1.6);
    plat(this.pPos.x, this.pPos.z); plat(this.ePos.x, this.ePos.z);
    // decorative background
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * (0.9 + i * 0.09), r = 11 + Math.random() * 4;
      const tree = new THREE.Mesh(new THREE.ConeGeometry(1, 3, 7), mat(zone === 'rocky' ? 0x7d776a : 0x2f7a3a));
      tree.position.set(Math.cos(a) * r + 2, 1.5, Math.sin(a) * r - 2);
      s.add(tree);
    }
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
    this.camera.position.set(-0.3, 2.4, 6.2);
    this.camera.lookAt(0.2, 0.7, -0.4);
  }

  setMesh(side, mon) {
    const key = side + 'Mesh';
    if (this[key]) this.scene.remove(this[key]);
    const m = buildMonsterMesh(mon.species);
    const pos = side === 'p' ? this.pPos : this.ePos;
    m.position.copy(pos);
    m.lookAt(side === 'p' ? this.ePos.x : this.pPos.x, pos.y, side === 'p' ? this.ePos.z : this.pPos.z);
    m.userData.baseScale = m.scale.x;
    this.scene.add(m);
    this[key] = m;
    return m;
  }

  update(dt, t) {
    for (const m of [this.pMesh, this.eMesh]) {
      if (!m || !m.visible) continue;
      animateMonster(m, t);
      if (!m.userData.anim) m.scale.y = m.userData.baseScale * (1 + Math.sin(t * 3 + (m === this.pMesh ? 0 : 1)) * 0.025);
    }
    // subtle camera sway
    this.camera.position.x = -0.3 + Math.sin(t * 0.4) * 0.15;
    this.camera.lookAt(0.2, 0.7, -0.4);
  }

  tween(dur, fn) { return this.game.tween(dur, fn); }
  wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  async appear(side, mon) {
    const m = this.setMesh(side, mon);
    const bs = m.userData.baseScale;
    m.userData.anim = true;
    UI.flash('#fff', 300);
    await this.tween(0.35, k => m.scale.setScalar(bs * k));
    m.userData.anim = false;
    UI.setPanel(side === 'p' ? 'player' : 'enemy', mon);
    $(side === 'p' ? 'player-panel' : 'enemy-panel').classList.remove('hidden');
  }

  async lunge(mesh, target) {
    const start = mesh.position.clone();
    const dir = target.clone().sub(start).setY(0).normalize().multiplyScalar(0.9);
    await this.tween(0.15, k => mesh.position.copy(start).addScaledVector(dir, k));
    await this.tween(0.2, k => mesh.position.copy(start).addScaledVector(dir, 1 - k));
  }

  async projectile(from, to, type) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10),
      new THREE.MeshStandardMaterial({ color: TYPE_HEX[type], emissive: TYPE_HEX[type], emissiveIntensity: 0.7 }));
    this.scene.add(ball);
    const a = from.clone().setY(0.9), b = to.clone().setY(0.8);
    await this.tween(0.4, k => { ball.position.lerpVectors(a, b, k); ball.position.y += Math.sin(k * Math.PI) * 0.8; ball.scale.setScalar(1 + k); });
    this.scene.remove(ball);
  }

  async hitShake(mesh) {
    const start = mesh.position.clone();
    await this.tween(0.4, k => {
      mesh.position.x = start.x + Math.sin(k * 40) * 0.12 * (1 - k);
      mesh.visible = Math.floor(k * 10) % 2 === 0 || k > 0.9;
    });
    mesh.position.copy(start); mesh.visible = true;
  }

  async statusGlow(mesh, color) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 8, 30), new THREE.MeshBasicMaterial({ color, transparent: true }));
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(mesh.position);
    this.scene.add(ring);
    await this.tween(0.6, k => { ring.position.y = mesh.position.y + k * 1.6; ring.material.opacity = 1 - k; });
    this.scene.remove(ring);
  }

  async faint(mesh) {
    const y = mesh.position.y;
    mesh.userData.anim = true;
    await this.tween(0.5, k => { mesh.position.y = y - k * 1.5; mesh.rotation.z = k * 0.3; });
    mesh.visible = false;
  }

  // ---------- Flow ----------
  async run() {
    UI.showBattle(true);
    $('player-panel').classList.add('hidden'); $('enemy-panel').classList.add('hidden');
    this.game.sound.battleStart();
    if (this.isWild) {
      await this.appear('e', this.enemy);
      await UI.say(this.opts.legendary ? `The legendary ${monName(this.enemy)} descends from the storm!` : `A wild ${monName(this.enemy)} appeared!`);
    } else {
      await UI.say(`${this.opts.trainer.name} wants to battle!`);
      await UI.say(`${this.opts.trainer.name} sent out ${monName(this.enemy)}!`);
      await this.appear('e', this.enemy);
    }
    await UI.say(`Go! ${monName(this.player)}!`);
    await this.appear('p', this.player);
    this.participants.add(this.player);

    let result = null;
    while (!result) result = await this.turn();
    UI.showBattle(false);
    return result;
  }

  async turn() {
    const choice = await UI.menu(['⚔️ FIGHT', '🎒 BAG', '🐾 TEAM', '🏃 RUN'],
      { title: `What will ${monName(this.player)} do?`, columns: 2, className: 'battle-menu' });
    let playerAction = null;
    if (choice === 0) {
      const mv = await this.chooseMove();
      if (mv === null) return null;
      playerAction = { type: 'move', move: mv };
    } else if (choice === 1) {
      const r = await this.useBag();
      if (r === 'cancel') return null;
      if (r === 'caught') return 'caught';
      playerAction = { type: 'item' };
    } else if (choice === 2) {
      const idx = await this.game.partyMenu('Switch to which monster?', true);
      if (idx < 0) return null;
      const target = this.state.party[idx];
      if (target === this.player) { await UI.say(`${monName(target)} is already in battle!`); return null; }
      if (target.hp <= 0) { await UI.say(`${monName(target)} has no energy left to fight!`); return null; }
      await this.switchTo(target, true);
      playerAction = { type: 'switch' };
    } else if (choice === 3) {
      if (!this.isWild) { await UI.say("No! There's no running from a trainer battle!"); return null; }
      this.runAttempts++;
      const odds = (this.player.spd * 32) / Math.max(1, (this.enemy.spd / 4) % 256) + 30 * this.runAttempts;
      if (this.opts.legendary ? Math.random() < 0.5 : Math.random() * 255 < odds) {
        this.game.sound.run();
        await UI.say('Got away safely!');
        return 'run';
      }
      await UI.say("Couldn't get away!");
      playerAction = { type: 'run' };
    }

    const enemyMove = this.enemyChooseMove();
    if (playerAction.type === 'move') {
      const pPri = MOVES[playerAction.move].priority || 0, ePri = MOVES[enemyMove].priority || 0;
      const pSpd = this.player.spd * stageMult(this.pStages.spd || 0), eSpd = this.enemy.spd * stageMult(this.eStages.spd || 0);
      const playerFirst = pPri !== ePri ? pPri > ePri : pSpd !== eSpd ? pSpd > eSpd : Math.random() < 0.5;
      const order = playerFirst ? ['p', 'e'] : ['e', 'p'];
      for (const side of order) {
        const r = await this.doAttack(side, side === 'p' ? playerAction.move : enemyMove);
        if (r) return r === 'continue' ? null : r;
      }
    } else {
      const r = await this.doAttack('e', enemyMove);
      if (r) return r === 'continue' ? null : r;
    }
    return null;
  }

  async chooseMove() {
    const m = this.player;
    if (m.moves.every(x => x.pp <= 0)) {
      await UI.say(`${monName(m)} has no moves left! It struggles!`);
      return 'tackle';
    }
    const labels = m.moves.map(x => {
      const mv = MOVES[x.id];
      return `<span class="mv-dot" style="background:${TYPE_COLORS[mv.type]}"></span>${mv.name} <small>${x.pp}/${mv.pp}</small>`;
    });
    const idx = await UI.menu(labels, {
      columns: 2, cancel: true, className: 'battle-menu', disabled: m.moves.map(x => x.pp <= 0),
      info: (i) => {
        const mv = MOVES[m.moves[i].id];
        const eff = mv.kind === 'status' ? '' : this.effText(typeMultiplier(mv.type, SPECIES[this.enemy.species].types));
        return `${UI.typeBadge(mv.type)} ${mv.kind === 'status' ? 'Status' : 'Power ' + mv.power} · Acc ${mv.acc} ${eff ? '· <i>' + eff + '</i>' : ''}`;
      }
    });
    if (idx < 0) return null;
    m.moves[idx].pp--;
    return m.moves[idx].id;
  }

  effText(mult) {
    return mult === 0 ? 'No effect' : mult > 1 ? 'Super effective' : mult < 1 ? 'Not very effective' : '';
  }

  enemyChooseMove() {
    const opts = this.enemy.moves.filter(x => x.pp > 0);
    if (!opts.length) return 'tackle';
    const scored = opts.map(x => {
      const mv = MOVES[x.id];
      let s = mv.kind === 'status' ? 25 : mv.power * typeMultiplier(mv.type, SPECIES[this.player.species].types) *
        (SPECIES[this.enemy.species].types.includes(mv.type) ? 1.5 : 1) * mv.acc / 100;
      return { x, s: s * (0.6 + Math.random() * 0.8) };
    }).sort((a, b) => b.s - a.s);
    const pick = scored[0].x;
    pick.pp--;
    return pick.id;
  }

  // side 'p' or 'e' attacks. Returns 'win'|'lose'|'continue' when the turn must stop, else null.
  async doAttack(side, moveId) {
    const att = side === 'p' ? this.player : this.enemy;
    const def = side === 'p' ? this.enemy : this.player;
    const attMesh = side === 'p' ? this.pMesh : this.eMesh;
    const defMesh = side === 'p' ? this.eMesh : this.pMesh;
    const aSt = side === 'p' ? this.pStages : this.eStages;
    const dSt = side === 'p' ? this.eStages : this.pStages;
    const mv = MOVES[moveId];
    const prefix = side === 'e' ? (this.isWild ? 'The wild ' : 'The foe\'s ') : '';
    await UI.say(`${prefix}${monName(att)} used ${mv.name}!`, { auto: 500 });
    const res = computeDamage(att, def, moveId, aSt, dSt);
    if (res.miss) { await UI.say(`${prefix}${monName(att)}'s attack missed!`); return null; }

    if (mv.kind === 'status') {
      const e = mv.effect;
      const tgtSt = e.target === 'self' ? aSt : dSt;
      const tgt = e.target === 'self' ? att : def;
      const tgtMesh = e.target === 'self' ? attMesh : defMesh;
      this.game.sound.status();
      await this.statusGlow(tgtMesh, e.stages > 0 ? 0xff6060 : 0x6080ff);
      const cur = tgtSt[e.stat] || 0;
      const statName = { atk: 'Attack', def: 'Defense', spd: 'Speed' }[e.stat];
      const who = (tgt === this.enemy ? (this.isWild ? 'The wild ' : "The foe's ") : '') + monName(tgt);
      if ((e.stages > 0 && cur >= 6) || (e.stages < 0 && cur <= -6)) { await UI.say(`${who}'s ${statName} won't go any ${e.stages > 0 ? 'higher' : 'lower'}!`); return null; }
      tgtSt[e.stat] = Math.max(-6, Math.min(6, cur + e.stages));
      await UI.say(`${who}'s ${statName} ${e.stages > 0 ? 'rose' : 'fell'}!`);
      return null;
    }

    if (mv.kind === 'phys') await this.lunge(attMesh, defMesh.position);
    else await this.projectile(attMesh.position, defMesh.position, mv.type);
    if (res.mult > 0) { this.game.sound.hit(res.mult); await this.hitShake(defMesh); }
    def.hp = Math.max(0, def.hp - res.damage);
    UI.setHp(side === 'p' ? 'enemy' : 'player', def);
    await this.wait(450);
    if (res.crit && res.mult > 0) await UI.say('A critical hit!');
    const eff = this.effText(res.mult);
    if (eff) await UI.say(res.mult === 0 ? `It doesn't affect ${monName(def)}...` : `It's ${eff.toLowerCase()}!`);

    if (def.hp <= 0) {
      this.game.sound.faint();
      await this.faint(defMesh);
      if (side === 'p') return await this.enemyFainted();
      return await this.playerFainted();
    }
    return null;
  }

  async enemyFainted() {
    const e = this.enemy;
    await UI.say(`${this.isWild ? 'The wild ' : "The foe's "}${monName(e)} fainted!`);
    const sp = SPECIES[e.species];
    let xp = Math.floor((sp.xp * e.level) / 7 * (this.isWild ? 1 : 1.5));
    const alive = [...this.participants].filter(m => m.hp > 0 && this.state.party.includes(m));
    const share = Math.max(1, Math.floor(xp / Math.max(1, alive.length)));
    for (const m of alive) await this.giveXp(m, share);
    if (!this.isWild) {
      this.enemyIdx++;
      if (this.enemyIdx < this.enemyTeam.length) {
        this.enemy = this.enemyTeam[this.enemyIdx];
        this.eStages = {};
        this.participants = new Set([this.player]);
        await UI.say(`${this.opts.trainer.name} sent out ${monName(this.enemy)}!`);
        await this.appear('e', this.enemy);
        return 'continue';
      }
      this.game.sound.victory();
      await UI.say(`You defeated ${this.opts.trainer.name}!`);
      await UI.say(`${this.opts.trainer.name}: ${this.opts.trainer.defeat}`);
      this.state.money += this.opts.trainer.reward;
      await UI.say(`You got ₽${this.opts.trainer.reward} for winning!`);
    } else {
      this.game.sound.victory();
    }
    return 'win';
  }

  async giveXp(m, amount) {
    await UI.say(`${monName(m)} gained ${amount} EXP!`, { auto: 700 });
    const events = gainXp(m, amount);
    if (m === this.player) UI.setXp(m);
    for (const ev of events) {
      if (ev.type === 'level') {
        this.game.sound.levelUp();
        if (m === this.player) { UI.setPanel('player', m); }
        await UI.say(`${monName(m)} grew to level ${ev.level}!`);
      } else if (ev.type === 'learn') {
        await UI.say(`${monName(m)} learned ${MOVES[ev.move].name}!`);
      } else if (ev.type === 'evolve') {
        await UI.say(`What? ${SPECIES[ev.from].name} is evolving!`);
        UI.flash('#fff', 1200);
        this.game.sound.evolve();
        if (m === this.player) { await this.appear('p', m); }
        await UI.say(`Congratulations! Your ${SPECIES[ev.from].name} evolved into ${SPECIES[ev.into].name}!`);
        this.state.dex[ev.into] = 'caught';
      }
    }
  }

  async playerFainted() {
    await UI.say(`${monName(this.player)} fainted!`);
    const alive = this.state.party.filter(m => m.hp > 0);
    if (!alive.length) {
      await UI.say('You have no more monsters that can fight!');
      await UI.say('You blacked out...');
      return 'lose';
    }
    let idx = -1;
    while (idx < 0 || this.state.party[idx].hp <= 0) {
      idx = await this.game.partyMenu('Choose your next monster!', false);
    }
    await this.switchTo(this.state.party[idx], false);
    return 'continue';
  }

  async switchTo(mon, voluntary) {
    if (voluntary) {
      await UI.say(`Come back, ${monName(this.player)}!`, { auto: 500 });
      const m = this.pMesh;
      await this.tween(0.25, k => m.scale.setScalar(m.userData.baseScale * (1 - k)));
    }
    this.player = mon;
    this.pStages = {};
    this.participants.add(mon);
    await UI.say(`Go! ${monName(mon)}!`, { auto: 500 });
    await this.appear('p', mon);
  }

  async useBag() {
    const bag = this.state.bag;
    const ids = Object.keys(bag).filter(k => bag[k] > 0);
    if (!ids.length) { await UI.say('Your bag is empty!'); return 'cancel'; }
    const idx = await UI.menu(ids.map(id => `${ITEMS[id].name} <small>x${bag[id]}</small>`),
      { title: 'Bag', cancel: true, info: i => ITEMS[ids[i]].desc });
    if (idx < 0) return 'cancel';
    const id = ids[idx], item = ITEMS[id];
    if (item.ball) {
      if (!this.isWild) { await UI.say("You can't catch another trainer's monster!"); return 'cancel'; }
      if (this.state.party.length >= 6 && this.state.box.length >= 60) { await UI.say('No room for more monsters!'); return 'cancel'; }
      bag[id]--;
      return await this.throwBall(item);
    }
    const tIdx = await this.game.partyMenu(`Use ${item.name} on which monster?`, true);
    if (tIdx < 0) return 'cancel';
    const ok = await this.game.applyItem(id, this.state.party[tIdx]);
    if (!ok) return 'cancel';
    if (this.state.party[tIdx] === this.player) UI.setHp('player', this.player);
    return 'used';
  }

  async throwBall(item) {
    await UI.say(`You threw a ${item.name}!`, { auto: 400 });
    const e = this.enemy, sp = SPECIES[e.species];
    const orb = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(item.ball > 1 ? 0x3060e0 : 0xe03030));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0xffffff));
    orb.add(top, bot);
    this.scene.add(orb);
    const a = new THREE.Vector3(-1.2, 1.2, 3), b = this.ePos.clone().setY(1.1);
    this.game.sound.throw();
    await this.tween(0.6, k => { orb.position.lerpVectors(a, b, k); orb.position.y += Math.sin(k * Math.PI) * 1.5; orb.rotation.x = k * 12; });
    UI.flash('#fff', 300);
    const em = this.eMesh, bs = em.userData.baseScale;
    em.userData.anim = true;
    await this.tween(0.3, k => em.scale.setScalar(bs * (1 - k)));
    await this.tween(0.3, k => { orb.position.y = 1.1 - k * 0.9; });
    const chance = Math.min(1, ((3 * e.maxHp - 2 * e.hp) * sp.catchRate * item.ball) / (3 * e.maxHp) / 255);
    const shakeP = Math.pow(chance, 0.25);
    let shakes = 0;
    for (let i = 0; i < 3; i++) {
      if (Math.random() > shakeP) break;
      shakes++;
      await this.wait(250);
      this.game.sound.shake();
      await this.tween(0.4, k => { orb.rotation.z = Math.sin(k * Math.PI * 2) * 0.5; });
    }
    if (shakes === 3) {
      this.game.sound.victory();
      top.material.color.setHex(0x888888);
      await UI.say(`Gotcha! ${monName(e)} was caught!`);
      this.scene.remove(orb);
      this.state.dex[e.species] = 'caught';
      if (this.state.party.length < 6) { this.state.party.push(e); await UI.say(`${monName(e)} joined your team!`); }
      else { this.state.box.push(e); await UI.say(`${monName(e)} was sent to storage.`); }
      return 'caught';
    }
    this.scene.remove(orb);
    UI.flash('#fff', 300);
    await this.tween(0.3, k => em.scale.setScalar(bs * k));
    em.userData.anim = false;
    await UI.say(['Oh no! It broke free!', 'Aww! It appeared to be caught!', 'Argh! So close!'][Math.min(2, shakes)]);
    return 'used';
  }
}
