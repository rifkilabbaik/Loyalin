const SPREADSHEET_ID = '1iZXLdFJiIfJt_glCwAqgIUrKGZmedTfsLeLSdTZU0e8';
const VERSION = '1.0';
const SHEET = { MEMBER: 'Member', TRANSAKSI: 'Transaksi', TOKO: 'Toko', PENGATURAN: 'Pengaturan' };

const MEMBER_COLS = [
  ['id', 'ID', ['id member', 'id kartu']],
  ['name', 'Nama', ['nama member', 'nama customer', 'nama pelanggan']],
  ['phone', 'No HP', ['no. hp', 'nomor hp', 'no telp', 'no. telp', 'nomor telepon', 'telepon', 'hp']],
  ['points', 'Poin', ['point', 'jumlah poin']],
  ['spent', 'Total Belanja', []],
  ['count', 'Jumlah Transaksi', ['transaksi']],
  ['store', 'Toko Daftar', []],
  ['createdAt', 'Terdaftar', ['tanggal daftar']],
  ['lastAt', 'Terakhir Belanja', []]
];
const TX_COLS = [
  ['at', 'Waktu', ['tanggal', 'timestamp']],
  ['id', 'ID', ['id member']],
  ['name', 'Nama', []],
  ['phone', 'No HP', ['no. hp', 'nomor hp']],
  ['type', 'Jenis', []],
  ['amount', 'Belanja', ['nominal']],
  ['points', 'Poin', ['point']],
  ['balance', 'Saldo Poin', ['total poin']],
  ['store', 'Toko', ['nama toko']]
];
const TOKO_COLS = [
  ['store', 'Nama Toko', ['toko', 'store', 'nama store', 'cabang']],
  ['kode', 'Kode Akses', ['kode', 'kode toko', 'pin', 'password']]
];
const SET_COLS = [['key', 'Pengaturan', ['kunci', 'nama']], ['value', 'Nilai', ['isi', 'value']]];
const DEFAULTS = [['Rupiah per Poin', '1000'], ['Batas Belanja', '5000000']];

const FORMATS = {
  id: '@', phone: '@',
  at: 'yyyy-mm-dd hh:mm:ss', createdAt: 'yyyy-mm-dd hh:mm:ss', lastAt: 'yyyy-mm-dd hh:mm:ss',
  amount: '#,##0', spent: '#,##0', points: '#,##0', balance: '#,##0', count: '0',
  value: '@', kode: '@'
};
const TEXT_KEYS = ['id', 'phone'];
const DUP_SECONDS = 120;
const MAX_AMOUNT = 1000000000;

const _cache = {};

function setup() {
  _sheet(SHEET.MEMBER, MEMBER_COLS);
  _sheet(SHEET.TRANSAKSI, TX_COLS);
  _sheet(SHEET.TOKO, TOKO_COLS);
  _settings();
}

function doGet() {
  return _json({ status: 'ok', data: { app: 'Loyalin', version: VERSION } });
}

function doPost(e) {
  let p;
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return _json({ status: 'error', error: 'Permintaan tidak valid' }); }
  try {
    return _json({ status: 'ok', data: _route(p) });
  } catch (err) {
    if (err && err.loyalin) return _json({ status: 'error', error: err.message, code: err.code });
    return _json({ status: 'error', error: String((err && err.message) || err) });
  }
}

function _route(p) {
  const a = String(p.action || '');
  if (a === 'toko') return _tokoList();
  if (a.indexOf('dasbor') === 0) return _dasbor(p);
  _auth(p);
  if (a === 'login') return { rpp: _cache.settings.rpp, batas: _cache.settings.batas, toko: _tokoList() };
  if (a === 'member') return _findMember('id', p.id);
  if (a === 'cariHp') return _findMember('phone', p.phone);
  if (a === 'register') return _locked(() => _register(p));
  if (a === 'transaksi') return _locked(() => _transaksi(p));
  throw _fail('Aksi tidak dikenal');
}

function _auth(p) {
  const rows = _tokoRows();
  if (!rows.length) throw _fail('Sheet Toko masih kosong', 'SETUP');
  const name = String(p.toko || '').trim();
  const toko = rows.filter(r => r.name === name)[0];
  if (!toko) throw _fail('Pilih toko lagi', 'TOKO');
  if (!toko.kode) throw _fail('Kode akses ' + name + ' belum diisi di sheet Toko', 'SETUP');
  if (String(p.kode || '').trim() !== toko.kode) { Utilities.sleep(800); throw _fail('Kode akses salah', 'AUTH'); }
  _cache.settings = _settings();
}

function _register(p) {
  const id = _id(p.id);
  const name = String(p.name || '').replace(/\s+/g, ' ').trim().replace(/^[=+\-@]+/, '').slice(0, 60);
  const phone = _phone(p.phone);
  if (!id) throw _fail('ID tidak valid');
  if (!name) throw _fail('Nama wajib diisi');
  if (!_validPhone(phone)) throw _fail('No. HP tidak valid', 'HP');
  const t = _sheet(SHEET.MEMBER, MEMBER_COLS);
  const exist = _findRow(t, 'id', id);
  if (exist) return { exists: true, member: _member(t, exist.values) };
  const dup = _findRow(t, 'phone', phone);
  if (dup) throw _fail('No. HP sudah terdaftar di ID ' + _get(t, dup.values, 'id'), 'HP');
  _append(t, { id: id, name: name, phone: phone, points: 0, spent: 0, count: 0, store: String(p.toko || '').trim(), createdAt: new Date() });
  return { exists: false, member: { id: id, name: name, phone: phone, points: 0 } };
}

function _transaksi(p) {
  const s = _cache.settings;
  const id = _id(p.id);
  const amount = Math.floor(Number(p.amount) || 0);
  if (!id) throw _fail('ID tidak valid');
  if (amount < s.rpp) throw _fail('Belanja minimal Rp ' + _rp(s.rpp));
  if (amount > MAX_AMOUNT) throw _fail('Nominal terlalu besar');
  const t = _sheet(SHEET.MEMBER, MEMBER_COLS);
  const found = _findRow(t, 'id', id);
  if (!found) throw _fail('ID belum terdaftar');
  const tx = _sheet(SHEET.TRANSAKSI, TX_COLS);
  const now = new Date();
  if (!p.force) {
    const sec = _recentDup(tx, id, amount, now);
    if (sec !== null) return { duplicate: true, seconds: sec };
  }
  const m = found.values;
  const pts = Math.floor(amount / s.rpp);
  const total = _num(_get(t, m, 'points')) + pts;
  _setCells(t, found.row, {
    points: total,
    spent: _num(_get(t, m, 'spent')) + amount,
    count: _num(_get(t, m, 'count')) + 1,
    lastAt: now
  });
  const name = String(_get(t, m, 'name'));
  _append(tx, {
    at: now, id: id, name: name, phone: _phone(_get(t, m, 'phone')), type: 'Belanja',
    amount: amount, points: pts, balance: total, store: String(p.toko || '').trim()
  });
  return { points: pts, total: total, name: name };
}

function _recentDup(tx, id, amount, now) {
  const last = tx.sh.getLastRow();
  if (last < 2) return null;
  const n = Math.min(80, last - 1);
  const vals = tx.sh.getRange(last - n + 1, 1, n, tx.width).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    const r = vals[i];
    const at = r[tx.col.at - 1];
    if (!(at instanceof Date)) continue;
    const sec = (now.getTime() - at.getTime()) / 1000;
    if (sec < 0 || sec > DUP_SECONDS) continue;
    if (_id(r[tx.col.id - 1]) === id && _num(r[tx.col.amount - 1]) === amount) return Math.round(sec);
  }
  return null;
}

function _findMember(key, raw) {
  const v = key === 'phone' ? _phone(raw) : _id(raw);
  if (!v) return null;
  const t = _sheet(SHEET.MEMBER, MEMBER_COLS);
  const r = _findRow(t, key, v);
  return r ? _member(t, r.values) : null;
}

function _findRow(t, key, v) {
  const last = t.sh.getLastRow();
  if (last < 2) return null;
  const vals = t.sh.getRange(2, t.col[key], last - 1, 1).getDisplayValues();
  for (let i = 0; i < vals.length; i++) {
    const c = key === 'phone' ? _phone(vals[i][0]) : _id(vals[i][0]);
    if (c && c === v) {
      const row = i + 2;
      return { row: row, values: t.sh.getRange(row, 1, 1, t.width).getValues()[0] };
    }
  }
  return null;
}

function _member(t, values) {
  return {
    id: _id(_get(t, values, 'id')),
    name: String(_get(t, values, 'name') || ''),
    phone: _phone(_get(t, values, 'phone')),
    points: _num(_get(t, values, 'points'))
  };
}

function _tokoList() {
  return _tokoRows().map(r => r.name);
}

function _tokoRows() {
  if (_cache.toko) return _cache.toko;
  const t = _sheet(SHEET.TOKO, TOKO_COLS);
  const last = t.sh.getLastRow();
  const out = [];
  if (last >= 2) {
    const seen = {};
    t.sh.getRange(2, 1, last - 1, t.width).getDisplayValues().forEach(r => {
      const name = String(r[t.col.store - 1]).replace(/\s+/g, ' ').trim();
      if (!name || seen[name.toLowerCase()]) return;
      seen[name.toLowerCase()] = 1;
      out.push({ name: name, kode: String(r[t.col.kode - 1]).trim() });
    });
  }
  _cache.toko = out;
  return out;
}

function _settings() {
  const t = _sheet(SHEET.PENGATURAN, SET_COLS);
  const last = t.sh.getLastRow();
  const rows = last > 1 ? t.sh.getRange(2, 1, last - 1, t.width).getDisplayValues() : [];
  const map = {};
  rows.forEach(r => {
    const k = String(r[t.col.key - 1]).trim().toLowerCase();
    if (k) map[k] = String(r[t.col.value - 1]).trim();
  });
  DEFAULTS.forEach(d => {
    if (!(d[0].toLowerCase() in map)) {
      _append(t, { key: d[0], value: d[1] });
      map[d[0].toLowerCase()] = d[1];
    }
  });
  const n = (k, fb) => { const d = String(map[k] || '').replace(/\D/g, ''); return d ? Number(d) : fb; };
  return {
    rpp: Math.max(1, n('rupiah per poin', 1000)),
    batas: n('batas belanja', 0)
  };
}

function _sheet(name, cols) {
  const key = 'sheet_' + name;
  if (_cache[key]) return _cache[key];
  const ss = _ss();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  let fresh = false;
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols.map(c => c[1])]).setFontWeight('bold');
    sh.setFrozenRows(1);
    fresh = true;
  }
  const width = Math.max(sh.getLastColumn(), 1);
  const head = sh.getRange(1, 1, 1, width).getDisplayValues()[0].map(h => String(h).trim().toLowerCase());
  const col = {};
  const added = [];
  cols.forEach(c => {
    const names = [c[1].toLowerCase()].concat(c[2] || []);
    let i = -1;
    for (let j = 0; j < names.length && i < 0; j++) i = head.indexOf(names[j]);
    if (i < 0) {
      head.push(c[1].toLowerCase());
      i = head.length - 1;
      sh.getRange(1, i + 1).setValue(c[1]).setFontWeight('bold');
      added.push(c[0]);
    }
    col[c[0]] = i + 1;
  });
  cols.forEach(c => {
    const f = FORMATS[c[0]];
    if (f && (fresh || added.indexOf(c[0]) >= 0) && sh.getMaxRows() > 1) {
      sh.getRange(2, col[c[0]], sh.getMaxRows() - 1, 1).setNumberFormat(f);
    }
  });
  const t = { sh: sh, col: col, width: head.length };
  _cache[key] = t;
  return t;
}

function _append(t, obj) {
  const sh = t.sh;
  const row = sh.getLastRow() + 1;
  if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 200);
  const vals = [];
  for (let i = 0; i < t.width; i++) vals.push('');
  Object.keys(obj).forEach(k => { if (t.col[k]) vals[t.col[k] - 1] = obj[k] == null ? '' : obj[k]; });
  Object.keys(obj).forEach(k => {
    const f = FORMATS[k];
    if (f && t.col[k] && (TEXT_KEYS.indexOf(k) >= 0 || k === 'value')) sh.getRange(row, t.col[k]).setNumberFormat(f);
  });
  sh.getRange(row, 1, 1, t.width).setValues([vals]);
  return row;
}

function _setCells(t, row, obj) {
  Object.keys(obj).forEach(k => { if (t.col[k]) t.sh.getRange(row, t.col[k]).setValue(obj[k]); });
}

function _get(t, values, key) {
  return t.col[key] ? values[t.col[key] - 1] : '';
}

function _locked(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw _fail('Server sibuk, coba lagi');
  try {
    const r = fn();
    SpreadsheetApp.flush();
    return r;
  } finally {
    lock.releaseLock();
  }
}

function _id(raw) {
  const s = String(raw == null ? '' : raw).trim().toUpperCase();
  return /^[A-Z0-9-]{1,40}$/.test(s) ? s : '';
}

function _phone(raw) {
  let d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (d.indexOf('62') === 0) d = d.slice(2);
  d = d.replace(/^0+/, '');
  return d ? '62' + d : '';
}

function _validPhone(p) { return /^628\d{7,11}$/.test(p); }
function _num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function _rp(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function _ss() { return _cache.ss || (_cache.ss = SpreadsheetApp.openById(SPREADSHEET_ID)); }
function _fail(msg, code) { const e = new Error(msg); e.loyalin = true; e.code = code || ''; return e; }
function _json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
