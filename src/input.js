// Gamepad (standard / Xbox mapping) + keyboard and mouse, unified into named actions.
const PAD = {
  jump: [0], dodge: [1], light: [2], heavy: [3], guard: [4], art: [5], lock: [6], bind: [7],
  map: [8], pause: [9], camReset: [11], potion: [12], kithPrev: [14], kithNext: [15],
  confirm: [0], cancel: [1], up: [12], down: [13], left: [14], right: [15], tabL: [4], tabR: [5],
};
const KEY = {
  jump: ['Space'], dodge: ['ShiftLeft', 'ShiftRight'], light: ['KeyJ', 'Mouse0'], heavy: ['KeyK', 'Mouse2'],
  guard: ['KeyQ'], art: ['KeyE'], lock: ['Tab', 'KeyC', 'Mouse1'], bind: ['KeyR'], map: ['KeyM'],
  pause: ['Escape', 'KeyP'], camReset: ['KeyV'], potion: ['KeyF'], kithPrev: ['KeyZ'], kithNext: ['KeyX'],
  confirm: ['Enter', 'Space', 'KeyJ'], cancel: ['Escape', 'Backspace', 'KeyK'],
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  tabL: ['KeyQ'], tabR: ['KeyE'],
};
const LABEL = {
  jump: ['A', 'Space'], dodge: ['B', 'Shift'], light: ['X', 'J'], heavy: ['Y', 'K'], guard: ['LB', 'Q'], art: ['RB', 'E'],
  lock: ['LT', 'Tab'], bind: ['RT', 'R'], map: ['View', 'M'], pause: ['Menu', 'Esc'], potion: ['D-pad Up', 'F'],
  kithPrev: ['D-pad Left', 'Z'], kithNext: ['D-pad Right', 'X'], confirm: ['A', 'Enter'], cancel: ['B', 'Esc'], tabL: ['LB', 'Q'], tabR: ['RB', 'E'],
};
const ACTIONS = Object.keys(PAD);
const keys = Object.create(null);
let mdx = 0, mdy = 0;

export const input = {
  moveX: 0, moveY: 0, camX: 0, camY: 0, mouseDX: 0, mouseDY: 0,
  usingPad: false, padName: '', gp: null,
  now: {}, prev: {}, press: {}, bufT: {}, navX: 0, navY: 0, _navDir: '', _navT: 0, anyPress: false,

  init(canvas) {
    addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(e.code)) e.preventDefault();
      if (!e.repeat) { keys[e.code] = true; this.usingPad = false; this._kbAny = true; }
    });
    addEventListener('keyup', (e) => { keys[e.code] = false; });
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
    canvas.addEventListener('mousedown', (e) => { keys['Mouse' + e.button] = true; this.usingPad = false; this._kbAny = true; if (this.wantLock && document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); });
    addEventListener('mouseup', (e) => { keys['Mouse' + e.button] = false; });
    addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { mdx += e.movementX; mdy += e.movementY; } });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('gamepadconnected', (e) => { this.padName = e.gamepad.id; });
  },

  update(dt) {
    let gp = null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) { if (p && p.connected && p.buttons.length >= 10) { gp = p; if (p.mapping === 'standard') break; } }
    this.gp = gp;
    const dz = (v) => { const a = Math.abs(v); return a < 0.2 ? 0 : Math.sign(v) * (a - 0.2) / 0.8; };
    let lx = 0, ly = 0, rx = 0, ry = 0, padAny = false;
    if (gp) {
      lx = dz(gp.axes[0] || 0); ly = dz(gp.axes[1] || 0); rx = dz(gp.axes[2] || 0); ry = dz(gp.axes[3] || 0);
      if (lx || ly || rx || ry) padAny = true;
    }
    const kx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), ky = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
    const cx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0), cy = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
    let mx = lx + kx, my = ly + ky; const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
    this.moveX = mx; this.moveY = my; this.camX = rx + cx; this.camY = ry + cy;
    this.mouseDX = mdx; this.mouseDY = mdy; mdx = 0; mdy = 0;

    const t = performance.now() / 1000;
    this.anyPress = false;
    for (const a of ACTIONS) {
      let d = false;
      for (const k of KEY[a] || []) if (keys[k]) d = true;
      if (gp) for (const b of PAD[a]) { const bt = gp.buttons[b]; if (bt && (bt.pressed || bt.value > 0.45)) { d = true; padAny = true; } }
      this.now[a] = d; this.press[a] = d && !this.prev[a]; this.prev[a] = d;
      if (this.press[a]) { this.bufT[a] = t; this.anyPress = true; }
    }
    if (padAny) this.usingPad = true;
    if (this._kbAny) { this.anyPress = true; this._kbAny = false; }

    // menu navigation with auto-repeat (d-pad, stick, arrows)
    let dir = '';
    const sx = gp ? gp.axes[0] || 0 : 0, sy = gp ? gp.axes[1] || 0 : 0;
    if (this.now.up || sy < -0.55) dir = 'u'; else if (this.now.down || sy > 0.55) dir = 'd';
    else if (this.now.left || sx < -0.55) dir = 'l'; else if (this.now.right || sx > 0.55) dir = 'r';
    this.navX = 0; this.navY = 0;
    if (dir !== this._navDir) { this._navDir = dir; this._navT = 0.34; this._emit(dir); }
    else if (dir) { this._navT -= dt; if (this._navT <= 0) { this._navT = 0.1; this._emit(dir); } }
  },
  _emit(d) { if (d === 'u') this.navY = -1; else if (d === 'd') this.navY = 1; else if (d === 'l') this.navX = -1; else if (d === 'r') this.navX = 1; },

  pressed(a) { return !!this.press[a]; },
  held(a) { return !!this.now[a]; },
  // true if the action was pressed within the last `w` seconds; consumes it
  buffered(a, w = 0.16) { const t = this.bufT[a]; if (t && performance.now() / 1000 - t <= w) { this.bufT[a] = 0; return true; } return false; },
  consume(a) { this.press[a] = false; this.bufT[a] = 0; },
  clear() { for (const a of ACTIONS) { this.press[a] = false; this.bufT[a] = 0; this.prev[a] = true; } },

  rumble(strong = 0.5, weak = 0.5, ms = 120) {
    const act = this.gp && this.gp.vibrationActuator;
    if (act && act.playEffect && this.usingPad) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  },
  glyph(a) {
    const l = LABEL[a]; if (!l) return a;
    if (this.usingPad) { const c = l[0].length === 1 ? ' ' + l[0] : ''; return `<span class="btn${c}">${l[0]}</span>`; }
    return `<span class="key">${l[1]}</span>`;
  },
};
