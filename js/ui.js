// DOM-based UI: dialog box, menus, battle panels, HUD. All interactions are promise-based.
const $ = (id) => document.getElementById(id);

const UI = {
  busy: 0,          // >0 while a dialog or menu is waiting for input
  _handler: null,   // current key handler for the active widget

  key(k) { if (this._handler) { this._handler(k); return true; } return false; },

  // Show text with typewriter effect; resolves when the player confirms.
  say(text, { auto = 0 } = {}) {
    return new Promise(resolve => {
      const box = $('dialog'), el = $('dialog-text'), arrow = $('dialog-arrow');
      box.classList.remove('hidden');
      this.busy++;
      let i = 0, done = false;
      el.textContent = '';
      arrow.style.visibility = 'hidden';
      const timer = setInterval(() => {
        i += 2; el.textContent = text.slice(0, i);
        if (i >= text.length) finishType();
      }, 18);
      const finishType = () => {
        clearInterval(timer); el.textContent = text; done = true; arrow.style.visibility = 'visible';
        if (auto) setTimeout(close, auto);
      };
      const close = () => {
        if (this._handler !== handler) return;
        this._handler = null; box.onclick = null;
        this.busy--;
        box.classList.add('hidden');
        resolve();
      };
      const handler = (k) => {
        if (k !== 'a' && k !== 'b') return;
        if (!done) finishType(); else if (!auto) close();
      };
      this._handler = handler;
      box.onclick = () => handler('a');
    });
  },

  // Show a list of options; resolves with the index chosen, or -1 if cancelled (when cancellable).
  // opts: { title, cancel, columns, className, disabled: [bool] , info: (i)=>string }
  menu(options, opts = {}) {
    return new Promise(resolve => {
      const box = $('menu');
      box.className = 'panel ' + (opts.className || '');
      box.innerHTML = '';
      this.busy++;
      if (opts.title) { const h = document.createElement('div'); h.className = 'menu-title'; h.textContent = opts.title; box.appendChild(h); }
      const list = document.createElement('div');
      list.className = 'menu-list';
      if (opts.columns) list.style.gridTemplateColumns = `repeat(${opts.columns}, 1fr)`;
      box.appendChild(list);
      const info = document.createElement('div'); info.className = 'menu-info';
      if (opts.info) box.appendChild(info);
      let sel = 0;
      const items = options.map((o, i) => {
        const d = document.createElement('div');
        d.className = 'menu-item' + (opts.disabled?.[i] ? ' disabled' : '');
        d.innerHTML = o;
        d.onmouseenter = () => { sel = i; render(); };
        d.onclick = (e) => { e.stopPropagation(); sel = i; choose(); };
        list.appendChild(d);
        return d;
      });
      const render = () => {
        items.forEach((d, i) => d.classList.toggle('sel', i === sel));
        if (opts.info) info.innerHTML = opts.info(sel) || '';
      };
      const finish = (v) => {
        this._handler = null; this.busy--;
        box.classList.add('hidden');
        resolve(v);
      };
      const choose = () => { if (!opts.disabled?.[sel]) finish(sel); };
      const cols = opts.columns || 1;
      this._handler = (k) => {
        const n = options.length;
        if (k === 'up') sel = (sel - cols + n) % n;
        else if (k === 'down') sel = (sel + cols) % n;
        else if (k === 'left' && cols > 1) sel = (sel - 1 + n) % n;
        else if (k === 'right' && cols > 1) sel = (sel + 1) % n;
        else if (k === 'a') return choose();
        else if (k === 'b' && opts.cancel) return finish(-1);
        render();
      };
      if (opts.cancel) {
        const c = document.createElement('div'); c.className = 'menu-cancel'; c.textContent = '✕ Back';
        c.onclick = (e) => { e.stopPropagation(); finish(-1); };
        box.appendChild(c);
      }
      box.classList.remove('hidden');
      render();
    });
  },

  typeBadge(t) { return `<span class="type" style="background:${TYPE_COLORS[t]}">${t}</span>`; },

  hpColor(frac) { return frac > 0.5 ? '#48d048' : frac > 0.2 ? '#f0c030' : '#e84040'; },

  monLine(m) {
    const frac = m.hp / m.maxHp;
    return `<div class="mon-line"><b>${monName(m)}</b> <small>Lv${m.level}</small> ${SPECIES[m.species].types.map(t => this.typeBadge(t)).join('')}
      <div class="bar"><div style="width:${frac * 100}%;background:${this.hpColor(frac)}"></div></div>
      <small>${m.hp}/${m.maxHp} HP${m.hp <= 0 ? ' — FAINTED' : ''}</small></div>`;
  },

  // ---- Battle panels ----
  setPanel(side, m) {
    const p = $(side + '-panel');
    p.querySelector('.p-name').textContent = monName(m);
    p.querySelector('.p-lv').textContent = 'Lv' + m.level;
    p.querySelector('.p-types').innerHTML = SPECIES[m.species].types.map(t => this.typeBadge(t)).join('');
    this.setHp(side, m, true);
    if (side === 'player') this.setXp(m);
  },

  setHp(side, m, instant) {
    const p = $(side + '-panel');
    const fill = p.querySelector('.bar div');
    const frac = Math.max(0, m.hp) / m.maxHp;
    fill.style.transition = instant ? 'none' : 'width 0.5s, background 0.5s';
    fill.style.width = frac * 100 + '%';
    fill.style.background = this.hpColor(frac);
    const t = p.querySelector('.p-hp');
    if (t) t.textContent = `${Math.max(0, m.hp)} / ${m.maxHp}`;
  },

  setXp(m) {
    const lo = xpForLevel(m.level), hi = xpForLevel(m.level + 1);
    $('player-panel').querySelector('.xp div').style.width = Math.min(100, ((m.xp - lo) / (hi - lo)) * 100) + '%';
  },

  showBattle(on) {
    $('battle-ui').classList.toggle('hidden', !on);
    $('hud').classList.toggle('hidden', on);
  },

  updateHud(state) {
    $('hud-money').textContent = '₽' + state.money;
    $('hud-party').innerHTML = state.party.map(m => {
      const f = m.hp / m.maxHp;
      return `<div class="hud-mon" title="${monName(m)}"><span>${monName(m)} ${m.level}</span><div class="bar"><div style="width:${f * 100}%;background:${this.hpColor(f)}"></div></div></div>`;
    }).join('');
  },

  toast(text) {
    const t = $('toast');
    t.textContent = text; t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), 1600);
  },

  flash(color = '#fff', ms = 400) {
    const f = $('flash');
    f.style.background = color;
    f.style.transition = 'none'; f.style.opacity = 1;
    requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = `opacity ${ms}ms`; f.style.opacity = 0; }));
  }
};
