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
    $('#inToko').addEventListener('change', (e) => { e.target.classList.toggle('empty', !e.target.value); e.target.closest('.field').classList.remove('bad'); });
    $('#setupForm').addEventListener('submit', (e) => { e.preventDefault(); this.login(); });
    $('#txForm').addEventListener('submit', (e) => { e.preventDefault(); this.saveTx(); });
    $('#newForm').addEventListener('submit', (e) => { e.preventDefault(); this.register(); });
    $('#manualForm').addEventListener('submit', (e) => { e.preventDefault(); this.submitManual(); });
    $$('#manualSeg button').forEach(b => b.addEventListener('click', () => this.setManualMode(b.dataset.mode)));
    $$('#manualSheet [data-close]').forEach(el => el.addEventListener('click', () => this.closeManual()));
    $('#setToko').addEventListener('change', (e) => this.pickToko(e.target.value));
    $('#tokoForm').addEventListener('submit', (e) => { e.preventDefault(); this.switchToko(); });
    $('#setKode').addEventListener('input', (e) => e.target.closest('.field').classList.remove('bad'));
    $$('#swatches button').forEach(b => b.addEventListener('click', () => { Store.set('palette', b.dataset.palette); this.applyTheme(); }));
    $$('#themeSeg button').forEach(b => b.addEventListener('click', () => { Store.set('theme', b.dataset.theme); this.applyTheme(); }));
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

    if (Store.get('kode') && Store.get('toko')) {
      this.enter();
      this.refresh();
    } else {
      this.showSetup();
    }
  },

  cfg() {
    const c = Store.json('cfg', {});
    return { rpp: Number(c.rpp) || CONFIG.RUPIAH_PER_POIN, batas: Number(c.batas) || CONFIG.BATAS_BELANJA };
  },

  saveSession(d) {
    Store.setJson('cfg', { rpp: d.rpp, batas: d.batas });
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
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    const meta = $('meta[name="theme-color"]');
    if (meta && bg) meta.setAttribute('content', bg);
  },

  fillToko(select, list, selected, placeholder) {
    const opts = (placeholder ? [`<option value="">${esc(placeholder)}</option>`] : [])
      .concat(list.map(t => `<option value="${esc(t)}">${esc(t)}</option>`));
    if (selected && list.indexOf(selected) < 0) opts.push(`<option value="${esc(selected)}">${esc(selected)}</option>`);
    select.innerHTML = opts.join('');
    select.value = selected || '';
    select.classList.toggle('empty', !select.value);
  },

  async loadToko(select, placeholder) {
    const current = select.value || Store.get('toko');
    this.fillToko(select, Store.json('tokoList', []), current, placeholder);
    try {
      const list = await Api.toko();
      Store.setJson('tokoList', list);
      this.fillToko(select, list, select.value || current, placeholder);
    } catch (e) {
      this.toast(e.message, true);
    }
  },

  showSetup() {
    Scanner.stop();
    $('#inKode').value = '';
    this.show('setup');
    this.fillToko($('#inToko'), Store.json('tokoList', []), Store.get('toko'), 'Pilih toko');
    this.loadToko($('#inToko'), 'Pilih toko');
  },

  toggleEye() {
    const i = $('#inKode');
    const show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    $('#btnEye').classList.toggle('on', show);
  },

  async login() {
    const toko = $('#inToko').value;
    const kode = $('#inKode').value.trim();
    if (!toko) { this.bad('#inToko'); return; }
    if (!kode) { this.bad('#inKode'); return; }
    const btn = $('#btnLogin');
    this.busy(btn, true);
    try {
      const d = await Api.login(kode, toko);
      Store.set('kode', kode);
      Store.set('toko', toko);
      this.saveSession(d);
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

  home(fromPop) {
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
    this.beep();
    await this.lookup(id);
  },

  beep() {
    if (navigator.vibrate) navigator.vibrate(60);
    try {
      this.audio = this.audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = this.audio.createOscillator(), g = this.audio.createGain();
      o.type = 'sine'; o.frequency.value = 1320;
      g.gain.setValueAtTime(0.12, this.audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + 0.12);
      o.connect(g); g.connect(this.audio.destination);
      o.start(); o.stop(this.audio.currentTime + 0.13);
    } catch (e) {}
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
    $('#mPoints').textContent = fmt(m.points);
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
    const pts = Math.floor(n / this.cfg().rpp);
    const base = this.member ? Number(this.member.points) || 0 : 0;
    const gain = $('#gain');
    const before = $('#gainPts').textContent;
    $('#gainPts').textContent = '+' + fmt(pts);
    $('#gainTotal').textContent = fmt(base + pts);
    gain.classList.toggle('empty', !pts);
    if (before !== $('#gainPts').textContent) { gain.classList.remove('bump'); void gain.offsetWidth; gain.classList.add('bump'); }
    $('#btnSave').disabled = !pts;
  },

  onPhone(input) {
    const n = Phone.normalize(input.value);
    input.value = n ? Phone.local(n) : '';
    input.closest('.field').classList.remove('bad');
  },

  txRows(amount, pts, total, big) {
    const m = this.member;
    return [
      { icon: 'user', html: `${esc(m.name)} <span class="c-sub">#${esc(m.id)}</span>` },
      { icon: 'store', html: esc(Store.get('toko')) },
      { cls: 'big' + (big ? ' alert' : ''), html: 'Rp ' + fmt(amount) },
      { icon: 'star', html: `<span class="c-gain"><span class="gain-plus">${ic('star')}<b>+${fmt(pts)}</b></span>${ic('arrow')}<span class="gain-total">${fmt(total)}</span></span>` }
    ];
  },

  async saveTx() {
    const m = this.member;
    const amount = Number(digits($('#inAmount').value)) || 0;
    const { rpp, batas } = this.cfg();
    if (!m || amount < rpp) return;
    const pts = Math.floor(amount / rpp);
    const total = (Number(m.points) || 0) + pts;
    const big = batas > 0 && amount >= batas;
    const ok = await this.confirm({
      title: 'Sudah sesuai?',
      icon: big ? 'alert' : 'check',
      rows: this.txRows(amount, pts, total, big),
      warn: big ? 'Nominal besar, cek lagi' : '',
      yes: 'Ya, simpan'
    });
    if (!ok) { $('#inAmount').focus(); return; }
    await this.sendTx(amount, false);
  },

  async sendTx(amount, force) {
    const m = this.member;
    const btn = $('#btnSave');
    this.busy(btn, true);
    try {
      const r = await Api.addTx({ id: m.id, amount, force: !!force });
      if (r.duplicate) {
        this.busy(btn, false);
        const pts = Math.floor(amount / this.cfg().rpp);
        const again = await this.confirm({
          title: 'Baru saja tercatat',
          icon: 'alert',
          rows: this.txRows(amount, pts, (Number(m.points) || 0) + pts, false),
          warn: 'Nominal sama masuk ' + this.ago(r.seconds),
          yes: 'Tetap simpan',
          no: 'Batal'
        });
        if (again) await this.sendTx(amount, true);
        return;
      }
      this.openDone({ name: r.name || m.name, plus: r.points, total: r.total });
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
    this.busy(btn, true);
    try {
      const r = await Api.register({ id: this.newId, name, phone });
      if (r.exists) this.toast('ID sudah terdaftar');
      this.openMember(r.member);
    } catch (e) {
      if (e.code === 'HP') this.bad('#inPhone');
      this.fail(e);
    } finally {
      this.busy(btn, false);
    }
  },

  openDone(r) {
    $('#dPlus').textContent = '+' + fmt(r.plus);
    $('#dName').textContent = r.name;
    $('#dTotal').textContent = fmt(r.total);
    this.show('done');
    if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
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
    this.busy(btn, true);
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
    this.fillToko($('#setToko'), Store.json('tokoList', []), Store.get('toko'));
    this.loadToko($('#setToko'));
  },

  pickToko(v) {
    const other = !!v && v !== Store.get('toko');
    $('#tokoForm').hidden = !other;
    $('#setKode').value = '';
    $('#setKode').closest('.field').classList.remove('bad');
    if (other) setTimeout(() => $('#setKode').focus(), 120);
  },

  async switchToko() {
    const toko = $('#setToko').value;
    const kode = $('#setKode').value.trim();
    if (!toko || toko === Store.get('toko')) return;
    if (!kode) { this.bad('#setKode'); return; }
    const btn = $('#btnSetToko');
    this.busy(btn, true);
    try {
      const d = await Api.login(kode, toko);
      Store.set('kode', kode);
      Store.set('toko', toko);
      this.saveSession(d);
      $('#tokoName').textContent = toko;
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
    const f = $(sel).closest('.field');
    f.classList.remove('bad'); void f.offsetWidth; f.classList.add('bad');
    $(sel).focus();
  },

  busy(btn, on) { btn.disabled = on; btn.classList.toggle('busy', on); },

  toast(msg, long) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(this._t);
    this._t = setTimeout(() => { t.hidden = true; }, long ? 3800 : 2400);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
