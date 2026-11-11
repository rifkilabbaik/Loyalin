const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const nf = new Intl.NumberFormat('id-ID');
const fmt = (n) => nf.format(Math.max(0, Math.floor(Number(n) || 0)));
const digits = (s) => String(s || '').replace(/\D/g, '');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (name) => `<svg class="ic"><use href="#i-${name}"/></svg>`;

const Store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  json(k, fb) { try { return JSON.parse(this.get(k)) || fb; } catch (e) { return fb; } },
  setJson(k, v) { this.set(k, JSON.stringify(v)); }
};

const Phone = {
  normalize(raw) {
    let d = digits(raw);
    if (d.startsWith('62')) d = d.slice(2);
    d = d.replace(/^0+/, '');
    return d ? '62' + d : '';
  },
  valid(n) { return /^628\d{7,11}$/.test(n); },
  local(n) {
    const d = digits(n).replace(/^62/, '');
    return d.replace(/^(\d{3})(\d{0,4})(\d{0,5})$/, (_, a, b, c) => [a, b, c].filter(Boolean).join(' '));
  },
  display(n) {
    const d = digits(n);
    if (!d) return '';
    const l = '0' + d.replace(/^62/, '');
    return l.replace(/^(\d{4})(\d{0,4})(\d{0,5})$/, (_, a, b, c) => [a, b, c].filter(Boolean).join('-'));
  }
};

const Api = {
  async call(action, payload, auth) {
    const body = Object.assign({ action }, payload);
    if (auth !== false) { body.kode = Store.get('kode'); body.toko = Store.get('toko'); }
    let res;
    try {
      res = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw new Error(navigator.onLine ? 'Koneksi gagal, coba lagi' : 'Tidak ada internet');
    }
    if (!res.ok) throw new Error('Server error ' + res.status);
    let j;
    try { j = await res.json(); } catch (e) { throw new Error('Apps Script belum siap'); }
    if (j.status !== 'ok') { const err = new Error(j.error || 'Gagal'); err.code = j.code || ''; throw err; }
    return j.data;
  },
  toko() { return this.call('toko', {}, false); },
  login(kode, toko) { return this.call('login', { kode, toko }, false); },
  member(id) { return this.call('member', { id }); },
  byPhone(phone) { return this.call('cariHp', { phone }); },
  register(m) { return this.call('register', m); },
  addTx(t) { return this.call('transaksi', t); }
};

const Scanner = {
  stream: null, detector: null, timer: 0, facing: 'environment', onCode: null, canvas: null, busy: false, starting: false,

  async start() {
    if (this.stream) { this.resume(); return; }
    if (this.starting || !navigator.mediaDevices) return;
    this.starting = true;
    $('#cam').classList.add('starting');
    const video = $('#video');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facing, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      if (App.view !== 'scan') { this.stop(); return; }
      video.srcObject = this.stream;
      await video.play();
      $('#cam').classList.add('live');
      if (!this.detector && 'BarcodeDetector' in window) {
        try { this.detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { this.detector = null; }
      }
      if (!this.detector) this.loadJsQR();
      this.busy = false;
      this.loop();
    } catch (e) {
      this.stream = null;
      $('#cam').classList.remove('live');
      if (e && e.name === 'NotAllowedError') App.toast('Izinkan akses kamera');
    } finally {
      this.starting = false;
      $('#cam').classList.remove('starting');
    }
  },

  loadJsQR() {
    if (window.jsQR || this.jsqrLoading) return;
    this.jsqrLoading = true;
    const s = document.createElement('script');
    s.src = 'js/vendor/jsQR.js';
    document.head.appendChild(s);
  },

  loop() {
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      if (!this.stream || this.busy) return;
      const code = await this.read();
      if (code && !this.busy && App.view === 'scan') { this.busy = true; this.onCode(code); }
      else this.loop();
    }, 160);
  },

  async read() {
    const video = $('#video');
    if (video.readyState < 2 || !video.videoWidth) return '';
    try {
      if (this.detector) {
        const r = await this.detector.detect(video);
        return r[0] ? r[0].rawValue : '';
      }
      if (window.jsQR) {
        const w = 520, h = Math.round(w * video.videoHeight / video.videoWidth);
        this.canvas = this.canvas || document.createElement('canvas');
        this.canvas.width = w; this.canvas.height = h;
        const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, w, h);
        const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        return r ? r.data : '';
      }
    } catch (e) {}
    return '';
  },

  resume() {
    this.busy = false;
    $('#cam').classList.remove('found');
    if (!this.stream) return;
    const v = $('#video');
    if (v.paused) v.play().catch(() => {});
    this.loop();
  },

  pause() {
    clearTimeout(this.timer);
    this.busy = true;
    if (this.stream) $('#video').pause();
  },

  stop() {
    clearTimeout(this.timer);
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    $('#video').srcObject = null;
    $('#cam').classList.remove('live', 'found');
    $('#btnTorch').classList.remove('on');
  },

  async torch() {
    const track = this.stream && this.stream.getVideoTracks()[0];
    if (!track) return;
    const on = !$('#btnTorch').classList.contains('on');
    try { await track.applyConstraints({ advanced: [{ torch: on }] }); $('#btnTorch').classList.toggle('on', on); }
    catch (e) { App.toast('Senter tidak tersedia'); }
  },

  flip() {
    this.facing = this.facing === 'environment' ? 'user' : 'environment';
    this.stop();
    this.start();
  }
};

class Dropdown {
  constructor(root, opts) {
    this.root = root;
    this.placeholder = (opts && opts.placeholder) || '';
    this.onChange = opts && opts.onChange;
    this.btn = $('.dd-btn', root);
    this.valEl = $('.dd-val', root);
    this.pop = $('.dd-pop', root);
    this.list = $('.dd-list', root);
    this.search = $('.dd-search', root);
    this.q = $('.dd-search input', root);
    this.items = [];
    this.shown = [];
    this.value = '';
    this.act = -1;
    this.btn.addEventListener('click', () => this.toggle());
    this.q.addEventListener('input', () => { this.act = -1; this.render(); });
    this.list.addEventListener('click', (e) => { const o = e.target.closest('.dd-opt'); if (o) this.pick(o.dataset.v); });
    root.addEventListener('keydown', (e) => this.key(e));
    document.addEventListener('pointerdown', (e) => { if (this.isOpen && !root.contains(e.target)) this.close(); });
    this.setValue('', true);
  }

  get isOpen() { return !this.pop.hidden; }

  setItems(items) {
    this.items = (items || []).slice();
    if (this.isOpen) this.render();
  }

  setValue(v, silent) {
    this.value = v || '';
    this.valEl.textContent = this.value || this.placeholder;
    this.root.classList.toggle('empty', !this.value);
    this.btn.classList.remove('bad');
    if (this.isOpen) this.render();
    if (!silent && this.onChange) this.onChange(this.value);
  }

  loading(on) {
    this.root.classList.toggle('loading', on);
    if (this.isOpen) this.render();
  }

  open() {
    const many = this.items.length > 6;
    this.q.value = '';
    this.act = -1;
    const r = this.btn.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    this.root.classList.toggle('up', below < 340 && r.top > below);
    this.pop.hidden = false;
    this.root.classList.add('open');
    this.btn.setAttribute('aria-expanded', 'true');
    this.render();
    const sel = $('.dd-opt.sel', this.list);
    if (sel) sel.scrollIntoView({ block: 'nearest' });
    if (many && matchMedia('(hover: hover)').matches) this.q.focus();
  }

  close() {
    if (!this.isOpen) return;
    this.pop.hidden = true;
    this.root.classList.remove('open', 'up');
    this.btn.setAttribute('aria-expanded', 'false');
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }

  render() {
    this.search.hidden = this.items.length <= 6;
    if (!this.items.length && this.root.classList.contains('loading')) {
      this.shown = [];
      this.list.innerHTML = '<span class="dd-skel"></span><span class="dd-skel"></span><span class="dd-skel"></span>';
      return;
    }
    const q = this.q.value.trim().toLowerCase();
    this.shown = q ? this.items.filter(t => t.toLowerCase().indexOf(q) >= 0) : this.items;
    if (!this.shown.length) { this.list.innerHTML = `<div class="dd-empty">${ic('store')}</div>`; return; }
    this.list.innerHTML = this.shown.map((t, i) => {
      const sel = t === this.value;
      return `<button type="button" role="option" aria-selected="${sel}" class="dd-opt${sel ? ' sel' : ''}${i === this.act ? ' act' : ''}" data-v="${esc(t)}" style="--i:${Math.min(i, 12)}"><span class="dd-ic">${ic('store')}</span><span class="t">${esc(t)}</span><svg class="ic ck"><use href="#i-check"/></svg></button>`;
    }).join('');
  }

  pick(v) {
    Sfx.play('tap');
    this.close();
    this.btn.focus();
    if (v !== this.value) this.setValue(v);
  }

  key(e) {
    if (e.key === 'Escape' && this.isOpen) { e.preventDefault(); e.stopPropagation(); this.close(); this.btn.focus(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!this.isOpen) this.open();
      const n = this.shown.length;
      if (!n) return;
      this.act = e.key === 'ArrowDown' ? (this.act + 1) % n : (this.act - 1 + n) % n;
      $$('.dd-opt', this.list).forEach((o, i) => o.classList.toggle('act', i === this.act));
      const a = $('.dd-opt.act', this.list);
      if (a) a.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Enter' && this.isOpen && this.act >= 0 && this.shown[this.act]) { e.preventDefault(); this.pick(this.shown[this.act]); }
  }
}

const Loader = {
  n: 0,
  show(icon) {
    this.n++;
    $('#loaderIc').innerHTML = `<use href="#i-${icon || 'upload'}"/>`;
    $('#loader').hidden = false;
  },
  hide() {
    this.n = Math.max(0, this.n - 1);
    if (!this.n) $('#loader').hidden = true;
  }
};

const Sfx = {
  ctx: null,
  out: null,
  nbuf: null,
  last: {},

  enabled() { return Store.get('sound') !== 'off'; },

  ac() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!this.ctx) {
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.8;
      this.out.connect(comp);
      comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  },

  unlock() { if (this.enabled()) this.ac(); },

  tone(f, t, d, o) {
    o = o || {};
    const c = this.ctx, osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.a || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(g);
    g.connect(this.out);
    osc.start(t);
    osc.stop(t + d + 0.03);
  },

  noise(t, d, o) {
    o = o || {};
    const c = this.ctx;
    if (!this.nbuf) {
      const len = Math.floor(c.sampleRate * 0.4);
      this.nbuf = c.createBuffer(1, len, c.sampleRate);
      const ch = this.nbuf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.nbuf;
    f.type = o.filter || 'lowpass';
    f.frequency.value = o.freq || 1200;
    g.gain.setValueAtTime(o.vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    src.start(t);
    src.stop(t + d + 0.02);
  },

  play(name) {
    if (!this.enabled()) return;
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < 120) return;
    this.last[name] = now;
    const c = this.ac();
    if (!c) return;
    const t = c.currentTime + 0.01;
    const T = (f, dt, d, o) => this.tone(f, t + dt, d, o);
    try {
      switch (name) {
        case 'scan':
          T(1175, 0, 0.08, { vol: 0.16 });
          T(1760, 0.075, 0.13, { vol: 0.16 });
          break;
        case 'tap':
          T(880, 0, 0.05, { vol: 0.07, to: 1150 });
          break;
        case 'pop':
          T(460, 0, 0.13, { vol: 0.22, to: 1080 });
          T(1500, 0.05, 0.08, { vol: 0.06 });
          break;
        case 'stamp':
          T(170, 0, 0.24, { vol: 0.6, to: 46 });
          T(95, 0, 0.17, { type: 'triangle', vol: 0.32, to: 40 });
          this.noise(t, 0.07, { vol: 0.38, freq: 1700 });
          this.noise(t + 0.015, 0.13, { vol: 0.2, freq: 380 });
          break;
        case 'chime':
          [1318.5, 1661.2, 1975.5].forEach((f, i) => T(f, 0.02 + i * 0.085, 0.45, { type: 'triangle', vol: 0.13 }));
          break;
        case 'full':
          [784, 987.8, 1174.7, 1568].forEach((f, i) => T(f, i * 0.1, 0.55, { type: 'triangle', vol: 0.14 }));
          [2093, 2637, 3136, 2637, 3136].forEach((f, i) => T(f, 0.46 + i * 0.065, 0.24, { vol: 0.05 }));
          break;
        case 'ok':
          T(988, 0, 0.1, { type: 'triangle', vol: 0.14 });
          T(1480, 0.09, 0.2, { type: 'triangle', vol: 0.14 });
          break;
        case 'warn':
          T(660, 0, 0.14, { type: 'triangle', vol: 0.15 });
          T(523, 0.13, 0.22, { type: 'triangle', vol: 0.15 });
          break;
        case 'error':
          T(240, 0, 0.11, { type: 'square', vol: 0.05 });
          T(180, 0.12, 0.2, { type: 'square', vol: 0.05 });
          break;
      }
    } catch (e) {}
  }
};

const Stamp = {
  ROT: [-12, 9, -6, 14, -9, 5, -14, 11, -4, 12, -8, 6],

  slots() { return App.cfg().slots; },

  prog(total, slots) {
    total = Math.max(0, Math.floor(Number(total) || 0));
    if (!total) return { filled: 0, full: 0 };
    const r = total % slots;
    return r ? { filled: r, full: Math.floor(total / slots) } : { filled: slots, full: total / slots };
  },

  cols(n) { return n <= 6 ? n : n <= 12 ? Math.ceil(n / 2) : 6; },

  html(filled, slots, badge, stagger) {
    let cells = '';
    for (let i = 0; i < slots; i++) {
      const gift = i === slots - 1;
      cells += `<span class="slot${i < filled ? ' on' : ''}${gift ? ' gift' : ''}" style="--r:${this.ROT[i % 12]}deg;--i:${i}"><span class="ink">${ic(gift ? 'gift' : 'star')}</span>${gift ? ic('gift') : `<i>${i + 1}</i>`}</span>`;
    }
    return `<div class="scard${stagger ? ' stagger' : ''}"><div class="scard-head"><span class="scard-count">${ic('stamp')}<b>${filled}</b><small>/${slots}</small></span><span class="scard-gift"${badge ? '' : ' hidden'}>${ic('gift')}<b>×${badge}</b></span></div><div class="scard-grid" style="--cols:${this.cols(slots)}">${cells}</div></div>`;
  },

  render(el, total, stagger) {
    const slots = this.slots();
    const p = this.prog(total, slots);
    el.innerHTML = this.html(p.filled, slots, p.full, stagger);
    return p;
  },

  label(total) {
    const slots = this.slots();
    const p = this.prog(total, slots);
    return { text: p.filled + '/' + slots, full: p.filled === slots };
  },

  chip(total) {
    const l = this.label(total);
    return `<span class="gain-total${l.full ? ' full' : ''}">${l.full ? ic('gift') : ''}${esc(l.text)}</span>`;
  },

  stamper() {
    return '<div class="stamper"><svg viewBox="0 0 66 88" aria-hidden="true"><circle class="k" cx="33" cy="13" r="11"/><rect class="n" x="27" y="21" width="12" height="22" rx="5"/><rect class="b" x="7" y="40" width="52" height="22" rx="10"/><rect class="h" x="13" y="45" width="16" height="5" rx="2.5"/><rect class="p" x="11" y="61" width="44" height="13" rx="4"/></svg></div>';
  },

  burst(host, from, n) {
    const hr = host.getBoundingClientRect(), fr = from.getBoundingClientRect();
    const x = fr.left - hr.left + fr.width / 2, y = fr.top - hr.top + fr.height / 2;
    const colors = ['var(--primary)', 'var(--sun)', 'var(--soft)', 'var(--ok)'];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const d = 40 + Math.random() * (n > 16 ? 110 : 60);
      const el = document.createElement('i');
      el.className = 'burst';
      el.style.cssText = `left:${x}px;top:${y}px;--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d).toFixed(1)}px;--s:${(6 + Math.random() * 9).toFixed(1)}px;background:${colors[i % colors.length]}`;
      host.appendChild(el);
      setTimeout(() => el.remove(), 950);
    }
  }
};

const App = {
  view: '',
  member: null,
  newId: '',
  manualMode: 'id',
  backTimer: 0,
  installEvt: null,

  init() {
    Scanner.onCode = (c) => this.onScan(c);
    $('#btnBack').addEventListener('click', () => this.home());
    $('#btnSettings').addEventListener('click', () => this.openSettings());
    $('#btnToko').addEventListener('click', () => this.openSettings());
    $('#btnManual').addEventListener('click', () => this.openManual());
    $('#btnTorch').addEventListener('click', () => Scanner.torch());
    $('#btnFlip').addEventListener('click', () => Scanner.flip());
    $('#cam').addEventListener('click', () => { if (!Scanner.stream) Scanner.start(); });
    $('#btnAgain').addEventListener('click', () => this.home());
    $('#btnEye').addEventListener('click', () => this.toggleEye());
    $('#inAmount').addEventListener('input', (e) => this.onAmount(e.target));
    $('#inPhone').addEventListener('input', (e) => this.onPhone(e.target));
    $('#inManualHp').addEventListener('input', (e) => this.onPhone(e.target));
    $('#inManual').addEventListener('input', (e) => e.target.closest('.field').classList.remove('bad'));
    $('#inName').addEventListener('input', (e) => e.target.closest('.field').classList.remove('bad'));
    $('#inKode').addEventListener('input', (e) => e.target.closest('.field').classList.remove('bad'));
    this.ddLogin = new Dropdown($('#ddToko'), { placeholder: 'Pilih toko' });
    this.ddSet = new Dropdown($('#ddSetToko'), { onChange: (v) => this.pickToko(v) });
    $('#setupForm').addEventListener('submit', (e) => { e.preventDefault(); this.login(); });
    $('#txForm').addEventListener('submit', (e) => { e.preventDefault(); this.saveTx(); });
    $('#newForm').addEventListener('submit', (e) => { e.preventDefault(); this.register(); });
    $('#manualForm').addEventListener('submit', (e) => { e.preventDefault(); this.submitManual(); });
    $$('#manualSeg button').forEach(b => b.addEventListener('click', () => this.setManualMode(b.dataset.mode)));
    $$('#manualSheet [data-close]').forEach(el => el.addEventListener('click', () => this.closeManual()));
    $('#tokoForm').addEventListener('submit', (e) => { e.preventDefault(); this.switchToko(); });
    $('#setKode').addEventListener('input', (e) => e.target.closest('.field').classList.remove('bad'));
    $$('#swatches button').forEach(b => b.addEventListener('click', () => { Sfx.play('tap'); Store.set('palette', b.dataset.palette); this.applyTheme(); }));
    $$('#themeSeg button').forEach(b => b.addEventListener('click', () => { Sfx.play('tap'); Store.set('theme', b.dataset.theme); this.applyTheme(); }));
    $$('#soundSeg button').forEach(b => b.addEventListener('click', () => { Store.set('sound', b.dataset.sound); this.applyTheme(); Sfx.play('pop'); }));
    document.addEventListener('pointerdown', () => Sfx.unlock(), { passive: true });
    document.addEventListener('keydown', () => Sfx.unlock());
    $('#btnLogout').addEventListener('click', () => this.logout());
    $('#btnInstall').addEventListener('click', () => this.install());
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.installEvt = e; $('#btnInstall').hidden = false; });
    window.addEventListener('appinstalled', () => { this.installEvt = null; $('#btnInstall').hidden = true; });
    window.addEventListener('popstate', () => this.onPop());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.onEscape(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) Scanner.stop();
      else if (this.view === 'scan') Scanner.start();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme());
    this.applyTheme();

    let ready;
    if (Store.get('kode') && Store.get('toko')) {
      this.enter();
      this.refresh();
      ready = Promise.resolve();
    } else {
      ready = this.showSetup();
    }
    const min = new Promise(r => setTimeout(r, 650));
    const max = new Promise(r => setTimeout(r, 3500));
    Promise.race([Promise.all([ready, min]), max]).then(() => this.hideSplash());
  },

  hideSplash() {
    const s = $('#splash');
    if (!s || s.classList.contains('out')) return;
    s.classList.add('out');
    setTimeout(() => s.remove(), 400);
  },


  cfg() {
    const c = Store.json('cfg', {});
    return {
      min: Number(c.min) || CONFIG.MIN_BELANJA,
      slots: Number(c.slots) || CONFIG.STAMP_PER_KARTU,
      batas: Number(c.batas) || CONFIG.BATAS_BELANJA
    };
  },

  saveSession(d) {
    Store.setJson('cfg', { min: d.min, slots: d.slots, batas: d.batas });
    if (Array.isArray(d.toko)) Store.setJson('tokoList', d.toko);
  },

  async refresh() {
    try { this.saveSession(await Api.login(Store.get('kode'), Store.get('toko'))); }
    catch (e) { if (e.code) this.fail(e); }
  },

  applyTheme() {
    const root = document.documentElement;
    const palette = Store.get('palette') || 'orange';
    const theme = Store.get('theme') || 'auto';
    const mode = theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    root.setAttribute('data-palette', palette);
    root.setAttribute('data-mode', mode);
    $$('#swatches button').forEach(b => b.classList.toggle('on', b.dataset.palette === palette));
    $$('#themeSeg button').forEach(b => b.classList.toggle('on', b.dataset.theme === theme));
    const sound = Sfx.enabled() ? 'on' : 'off';
    $$('#soundSeg button').forEach(b => b.classList.toggle('on', b.dataset.sound === sound));
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    const meta = $('meta[name="theme-color"]');
    if (meta && bg) meta.setAttribute('content', bg);
  },

  async loadToko(dd) {
    dd.setItems(Store.json('tokoList', []));
    dd.loading(true);
    try {
      const list = await Api.toko();
      Store.setJson('tokoList', list);
      dd.setItems(list);
    } catch (e) {
      this.toast(e.message, true);
    } finally {
      dd.loading(false);
    }
  },

  showSetup() {
    Scanner.stop();
    $('#inKode').value = '';
    this.show('setup');
    this.ddLogin.setValue(Store.get('toko'), true);
    return this.loadToko(this.ddLogin);
  },

  toggleEye() {
    const i = $('#inKode');
    const show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    $('#btnEye').classList.toggle('on', show);
  },

  async login() {
    const toko = this.ddLogin.value;
    const kode = $('#inKode').value.trim();
    if (!toko) { this.bad('#ddToko .dd-btn'); return; }
    if (!kode) { this.bad('#inKode'); return; }
    const btn = $('#btnLogin');
    this.busy(btn, true, 'lock');
    try {
      const d = await Api.login(kode, toko);
      Store.set('kode', kode);
      Store.set('toko', toko);
      this.saveSession(d);
      Sfx.play('ok');
      this.enter();
    } catch (e) {
      if (e.code === 'AUTH') this.bad('#inKode');
      this.toast(e.message, true);
    } finally {
      this.busy(btn, false);
    }
  },

  enter() {
    $('#tokoName').textContent = Store.get('toko');
    this.show('scan');
  },

  fail(e) {
    if (e.code === 'AUTH' || e.code === 'SETUP' || e.code === 'TOKO') {
      if (e.code === 'AUTH') Store.del('kode');
      this.toast(e.message, true);
      this.closeSheets();
      this.showSetup();
      return;
    }
    this.toast(e.message, true);
  },

  show(view) {
    const prev = this.view;
    this.view = view;
    if (this.ddLogin) { this.ddLogin.close(); this.ddSet.close(); }
    $$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === view));
    const sub = ['member', 'new', 'done', 'settings'].indexOf(view) >= 0;
    $('#topbar').hidden = view === 'setup';
    $('#btnBack').hidden = !sub;
    $('#brand').hidden = view !== 'scan';
    $('#btnToko').hidden = view !== 'scan';
    $('#btnSettings').hidden = view !== 'scan';
    $('#pageTitle').hidden = view !== 'settings';
    $('#pageTitle').textContent = view === 'settings' ? 'Pengaturan' : '';
    if (sub && history.state !== 'sub') history.pushState('sub', '');
    if (!sub && history.state === 'sub' && prev !== view) history.back();
    if (view === 'scan') Scanner.start();
    else if (view === 'setup') Scanner.stop();
    else Scanner.pause();
    window.scrollTo(0, 0);
  },

  onPop() {
    if (!$('#confirmSheet').hidden) { this.answer(false); }
    if (!$('#manualSheet').hidden) this.closeManual();
    if (['member', 'new', 'done', 'settings'].indexOf(this.view) >= 0) this.home(true);
  },

  onEscape() {
    if (!$('#confirmSheet').hidden) { this.answer(false); return; }
    if (!$('#manualSheet').hidden) { this.closeManual(); return; }
    if (this.view !== 'scan' && this.view !== 'setup') this.home();
  },

  clearDone() {
    (this.doneTimers || []).forEach(clearTimeout);
    this.doneTimers = [];
  },

  home(fromPop) {
    this.clearDone();
    clearTimeout(this.backTimer);
    $('#ring').classList.remove('run');
    this.member = null;
    if (fromPop && history.state === 'sub') history.replaceState(null, '');
    if (fromPop) { this.view = ''; }
    this.show('scan');
    Scanner.resume();
  },

  cleanId(raw) {
    const s = String(raw || '').trim();
    const m = s.match(/[A-Za-z0-9-]{1,40}$/);
    return m ? m[0].toUpperCase() : '';
  },

  async onScan(raw) {
    const id = this.cleanId(raw);
    if (!id) { this.toast('QR tidak dikenali', true); setTimeout(() => Scanner.resume(), 1200); return; }
    $('#cam').classList.add('found');
    Sfx.play('scan');
    if (navigator.vibrate) navigator.vibrate(60);
    await this.lookup(id);
  },

  async lookup(id) {
    Scanner.busy = true;
    $('#cam').classList.add('found');
    try {
      const m = await Api.member(id);
      if (m) this.openMember(m); else this.openNew(id);
    } catch (e) {
      this.fail(e);
      if (this.view === 'scan') Scanner.resume();
    }
  },

  openMember(m) {
    this.member = m;
    $('#mId').textContent = m.id;
    $('#mInitial').textContent = (m.name || '?').trim().charAt(0).toUpperCase();
    $('#mName').textContent = m.name;
    $('#mPhone').textContent = Phone.display(m.phone);
    this.memberProg = Stamp.render($('#mCard'), m.stamps, true);
    $('#inAmount').value = '';
    this.onAmount($('#inAmount'));
    this.show('member');
    setTimeout(() => $('#inAmount').focus(), 260);
  },

  openNew(id) {
    this.newId = id;
    $('#nId').textContent = id;
    $('#inName').value = '';
    $('#inPhone').value = '';
    $$('[data-view="new"] .field').forEach(f => f.classList.remove('bad'));
    this.show('new');
    setTimeout(() => $('#inName').focus(), 260);
  },

  onAmount(input) {
    const n = Number(digits(input.value).slice(0, 12)) || 0;
    input.value = n ? fmt(n) : '';
    const { min, slots } = this.cfg();
    const ok = !!this.member && n >= min;
    const gain = $('#gain');
    $('#gainMin').textContent = fmt(min);
    if (ok) $('#gainTotal').outerHTML = Stamp.chip((Number(this.member.stamps) || 0) + 1).replace('class="gain-total', 'id="gainTotal" class="gain-total');
    if (ok && !gain.classList.contains('ok')) Sfx.play('pop');
    gain.classList.toggle('ok', ok);
    const p = this.memberProg;
    $$('#mCard .slot').forEach((el, i) => el.classList.toggle('ghost', ok && !!p && p.filled < slots && i === p.filled));
    $('#btnSave').disabled = !ok;
  },

  onPhone(input) {
    const n = Phone.normalize(input.value);
    input.value = n ? Phone.local(n) : '';
    input.closest('.field').classList.remove('bad');
  },

  txRows(amount, total, big) {
    const m = this.member;
    return [
      { icon: 'user', html: `${esc(m.name)} <span class="c-sub">#${esc(m.id)}</span>` },
      { icon: 'store', html: esc(Store.get('toko')) },
      { cls: 'big' + (big ? ' alert' : ''), html: 'Rp ' + fmt(amount) },
      { icon: 'stamp', html: `<span class="c-gain"><span class="gain-plus">${ic('stamp')}<b>+1</b></span>${ic('arrow')}${Stamp.chip(total)}</span>` }
    ];
  },

  async saveTx() {
    const m = this.member;
    const amount = Number(digits($('#inAmount').value)) || 0;
    const { min, batas } = this.cfg();
    if (!m || amount < min) return;
    const total = (Number(m.stamps) || 0) + 1;
    const big = batas > 0 && amount >= batas;
    const ok = await this.confirm({
      title: 'Sudah sesuai?',
      icon: big ? 'alert' : 'check',
      rows: this.txRows(amount, total, big),
      warn: big ? 'Nominal besar, cek lagi' : '',
      yes: 'Ya, simpan'
    });
    if (!ok) { $('#inAmount').focus(); return; }
    await this.sendTx(amount, false);
  },

  async sendTx(amount, force) {
    const m = this.member;
    const btn = $('#btnSave');
    this.busy(btn, true, 'upload');
    try {
      const r = await Api.addTx({ id: m.id, amount, force: !!force });
      if (r.duplicate) {
        this.busy(btn, false);
        const again = await this.confirm({
          title: 'Baru saja tercatat',
          icon: 'alert',
          rows: this.txRows(amount, (Number(m.stamps) || 0) + 1, false),
          warn: 'Sudah dapat stamp ' + this.ago(r.seconds),
          yes: 'Tetap simpan',
          no: 'Batal'
        });
        if (again) await this.sendTx(amount, true);
        return;
      }
      this.openDone({ name: r.name || m.name, total: r.total });
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy(btn, false);
    }
  },

  ago(s) {
    s = Math.max(1, Math.round(Number(s) || 0));
    return s < 60 ? s + ' detik lalu' : Math.round(s / 60) + ' menit lalu';
  },

  async register() {
    const name = $('#inName').value.trim().replace(/\s+/g, ' ');
    const phone = Phone.normalize($('#inPhone').value);
    if (!name) { this.bad('#inName'); return; }
    if (!Phone.valid(phone)) { this.bad('#inPhone'); return; }
    const ok = await this.confirm({
      title: 'Sudah sesuai?',
      icon: 'user-plus',
      rows: [
        { icon: 'hash', html: esc(this.newId) },
        { icon: 'user', html: esc(name) },
        { icon: 'phone', html: esc(Phone.display(phone)) },
        { icon: 'store', html: esc(Store.get('toko')) }
      ],
      yes: 'Ya, daftar'
    });
    if (!ok) return;
    const btn = $('#btnRegister');
    this.busy(btn, true, 'upload');
    try {
      const r = await Api.register({ id: this.newId, name, phone });
      if (r.exists) this.toast('ID sudah terdaftar');
      else Sfx.play('ok');
      this.openMember(r.member);
    } catch (e) {
      if (e.code === 'HP') this.bad('#inPhone');
      this.fail(e);
    } finally {
      this.busy(btn, false);
    }
  },

  openDone(r) {
    const slots = Stamp.slots();
    const now = Stamp.prog(r.total, slots);
    const completes = now.filled === slots;
    const start = Math.max(0, now.filled - 1);
    const card = $('#dCard');
    card.innerHTML = Stamp.html(start, slots, completes ? now.full - 1 : now.full, false) + Stamp.stamper();
    $('#dName').textContent = r.name;
    const plus = $('#dPlus');
    plus.classList.remove('show');
    this.show('done');
    this.clearDone();
    const target = $$('.slot', card)[start];
    const stamper = $('.stamper', card);
    const cr = card.getBoundingClientRect(), tr = target.getBoundingClientRect();
    const sw = stamper.offsetWidth, sh = stamper.offsetHeight;
    stamper.style.left = (tr.left - cr.left + tr.width / 2 - sw / 2) + 'px';
    stamper.style.top = (tr.top - cr.top + tr.height / 2 + tr.height * 0.3 - sh * 74 / 88) + 'px';
    stamper.classList.add('go');
    this.doneTimers = [
      setTimeout(() => {
        target.classList.add('on', 'fresh');
        const sc = $('.scard', card);
        sc.classList.add('thud');
        const n = $('.scard-count b', card);
        n.textContent = now.filled;
        n.classList.add('bump');
        Stamp.burst(card, target, completes ? 22 : 14);
        Sfx.play('stamp');
        if (navigator.vibrate) navigator.vibrate([25, 30, 60]);
      }, 400),
      setTimeout(() => {
        plus.classList.add('show');
        if (!completes) { Sfx.play('chime'); return; }
        Sfx.play('full');
        const g = $('.scard-gift', card);
        g.hidden = false;
        $('b', g).textContent = '×' + now.full;
        g.classList.add('pop');
        Stamp.burst(card, target, 30);
      }, 780)
    ];
    const ring = $('#ring');
    ring.style.setProperty('--t', CONFIG.AUTO_BACK_MS + 'ms');
    ring.classList.remove('run'); void ring.offsetWidth; ring.classList.add('run');
    clearTimeout(this.backTimer);
    this.backTimer = setTimeout(() => { if (this.view === 'done') this.home(); }, CONFIG.AUTO_BACK_MS);
  },

  openManual() {
    $('#manualSheet').hidden = false;
    $('#inManual').value = '';
    $('#inManualHp').value = '';
    $$('#manualSheet .field').forEach(f => f.classList.remove('bad'));
    this.setManualMode(this.manualMode);
  },

  setManualMode(mode) {
    this.manualMode = mode;
    $$('#manualSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    $('#fManualId').hidden = mode !== 'id';
    $('#fManualHp').hidden = mode !== 'hp';
    setTimeout(() => (mode === 'id' ? $('#inManual') : $('#inManualHp')).focus(), 120);
  },

  closeManual() { $('#manualSheet').hidden = true; },

  async submitManual() {
    if (this.manualMode === 'id') {
      const id = this.cleanId($('#inManual').value);
      if (!id) { this.bad('#inManual'); return; }
      this.closeManual();
      await this.lookup(id);
      return;
    }
    const phone = Phone.normalize($('#inManualHp').value);
    if (!Phone.valid(phone)) { this.bad('#inManualHp'); return; }
    const btn = $('#btnFind');
    this.busy(btn, true, 'search');
    try {
      const m = await Api.byPhone(phone);
      if (!m) { this.bad('#inManualHp'); this.toast('No. HP belum terdaftar', true); return; }
      this.closeManual();
      this.openMember(m);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy(btn, false);
    }
  },

  openSettings() {
    this.show('settings');
    this.applyTheme();
    $('#btnInstall').hidden = !this.installEvt;
    $('#tokoForm').hidden = true;
    this.ddSet.close();
    this.ddSet.setValue(Store.get('toko'), true);
    this.loadToko(this.ddSet);
  },

  pickToko(v) {
    const other = !!v && v !== Store.get('toko');
    $('#tokoForm').hidden = !other;
    $('#setKode').value = '';
    $('#setKode').closest('.field').classList.remove('bad');
    if (other) setTimeout(() => $('#setKode').focus(), 120);
  },

  async switchToko() {
    const toko = this.ddSet.value;
    const kode = $('#setKode').value.trim();
    if (!toko || toko === Store.get('toko')) return;
    if (!kode) { this.bad('#setKode'); return; }
    const btn = $('#btnSetToko');
    this.busy(btn, true, 'store');
    try {
      const d = await Api.login(kode, toko);
      Store.set('kode', kode);
      Store.set('toko', toko);
      this.saveSession(d);
      $('#tokoName').textContent = toko;
      Sfx.play('ok');
      $('#tokoForm').hidden = true;
      $('#setKode').value = '';
      this.toast(toko);
    } catch (e) {
      if (e.code === 'AUTH') this.bad('#setKode');
      this.toast(e.message, true);
    } finally {
      this.busy(btn, false);
    }
  },

  async install() {
    if (!this.installEvt) return;
    this.installEvt.prompt();
    try { await this.installEvt.userChoice; } catch (e) {}
    this.installEvt = null;
    $('#btnInstall').hidden = true;
  },

  async logout() {
    const ok = await this.confirm({
      title: 'Keluar?',
      icon: 'logout',
      rows: [{ icon: 'store', html: esc(Store.get('toko')) }],
      yes: 'Keluar',
      no: 'Batal'
    });
    if (!ok) return;
    Store.del('kode');
    if (history.state === 'sub') history.replaceState(null, '');
    this.showSetup();
  },

  confirm(o) {
    return new Promise(resolve => {
      if (this.pending) this.pending(false);
      this.pending = resolve;
      Sfx.play(o.icon === 'alert' ? 'warn' : 'tap');
      $('#cTitle').textContent = o.title;
      $('#cIcon').classList.toggle('warn', o.icon === 'alert');
      $('#cIcon').innerHTML = ic(o.icon || 'check');
      $('#cBox').innerHTML = o.rows.map(r => `<div class="c-row ${r.cls || ''}">${r.icon ? ic(r.icon) : ''}<span class="c-val">${r.html}</span></div>`).join('');
      $('#cWarn').hidden = !o.warn;
      $('#cWarn span').textContent = o.warn || '';
      $('#cYes').textContent = o.yes || 'Ya, simpan';
      $('#cNo').textContent = o.no || 'Ubah';
      $('#cYes').onclick = () => this.answer(true);
      $$('#confirmSheet [data-no]').forEach(el => { el.onclick = () => this.answer(false); });
      $('#confirmSheet').hidden = false;
      if (document.activeElement) document.activeElement.blur();
      setTimeout(() => $('#cYes').focus(), 60);
    });
  },

  answer(v) {
    $('#confirmSheet').hidden = true;
    const p = this.pending;
    this.pending = null;
    if (p) p(v);
  },

  closeSheets() {
    if (!$('#confirmSheet').hidden) this.answer(false);
    this.closeManual();
  },

  bad(sel) {
    Sfx.play('error');
    const f = $(sel).closest('.field');
    f.classList.remove('bad'); void f.offsetWidth; f.classList.add('bad');
    $(sel).focus();
  },

  busy(btn, on, icon) {
    if (on === !!btn._busy) return;
    btn._busy = on;
    btn.disabled = on;
    if (on) Loader.show(icon); else Loader.hide();
  },

  toast(msg, long) {
    if (long) Sfx.play('error');
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(this._t);
    this._t = setTimeout(() => { t.hidden = true; }, long ? 3800 : 2400);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
