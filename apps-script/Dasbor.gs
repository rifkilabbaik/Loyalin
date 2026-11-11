const DASBOR_VERSION = '2.0';
const D_SHEET = { MEMBER: 'Member', TRANSAKSI: 'Transaksi', TOKO: 'Toko', PENGATURAN: 'Pengaturan' };
const D_KODE = 'Kode Admin';

const D_MEMBER = {
  id: ['id', 'id member', 'id kartu'],
  name: ['nama', 'nama member', 'nama customer', 'nama pelanggan'],
  phone: ['no hp', 'no. hp', 'nomor hp', 'no telp', 'no. telp', 'nomor telepon', 'telepon', 'hp'],
  stamps: ['stamp', 'stamps', 'jumlah stamp', 'poin', 'point', 'jumlah poin'],
  spent: ['total belanja'],
  count: ['jumlah transaksi', 'transaksi'],
  store: ['toko daftar'],
  createdAt: ['terdaftar', 'tanggal daftar'],
  lastAt: ['terakhir belanja']
};
const D_TX = {
  at: ['waktu', 'tanggal', 'timestamp'],
  id: ['id', 'id member'],
  name: ['nama'],
  phone: ['no hp', 'no. hp', 'nomor hp'],
  type: ['jenis'],
  amount: ['belanja', 'nominal'],
  stamps: ['stamp', 'stamps', 'poin', 'point'],
  balance: ['saldo stamp', 'total stamp', 'saldo poin', 'total poin'],
  store: ['toko', 'nama toko']
};
const D_TOKO = { store: ['nama toko', 'toko', 'store', 'nama store', 'cabang'] };
const D_SET = { key: ['pengaturan', 'kunci', 'nama'], value: ['nilai', 'isi', 'value'] };

function setupDasbor() {
  _dKode(_dSs());
}

function _dasbor(p) {
  const a = String(p.action || '');
  const ss = _dSs();
  const set = _dAuth(ss, p);
  if (a === 'dasbor') return _dData(ss, set);
  if (a === 'dasborMember') return _dLocked(() => _dEditMember(ss, p));
  if (a === 'dasborHapus') return _dLocked(() => _dDeleteMember(ss, p));
  if (a === 'dasborBatal') return _dLocked(() => _dCancel(ss, p));
  throw _dFail('Aksi tidak dikenal');
}

function _dAuth(ss, p) {
  const set = _dKode(ss);
  if (!set.kode) throw _dFail('Isi Kode Admin di sheet Pengaturan', 'SETUP');
  if (String(p.kode || '').trim() !== set.kode) { Utilities.sleep(800); throw _dFail('Kode admin salah', 'AUTH'); }
  return set;
}

function _dKode(ss) {
  let sh = ss.getSheetByName(D_SHEET.PENGATURAN);
  if (!sh) {
    sh = ss.insertSheet(D_SHEET.PENGATURAN);
    sh.getRange(1, 1, 1, 2).setValues([['Pengaturan', 'Nilai']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  const t = _dTable(sh, D_SET);
  const map = {};
  t.rows.forEach(r => {
    const k = String(r[t.col.key - 1]).trim().toLowerCase();
    if (k && !(k in map)) map[k] = String(r[t.col.value - 1]).trim();
  });
  const key = D_KODE.toLowerCase();
  if (!(key in map) && t.col.key && t.col.value) {
    const row = sh.getLastRow() + 1;
    sh.getRange(row, t.col.value).setNumberFormat('@');
    sh.getRange(row, t.col.key).setValue(D_KODE);
    map[key] = '';
  }
  const n = (k, fb) => { const d = String(map[k] || '').replace(/\D/g, ''); return d ? Number(d) : fb; };
  return {
    kode: map[key] || '',
    min: Math.max(1, n('minimal belanja', 13000)),
    slots: Math.min(30, Math.max(2, n('stamp per kartu', 10))),
    batas: n('batas belanja', 0)
  };
}

function _dData(ss, set) {
  const m = _dRead(ss, D_SHEET.MEMBER, D_MEMBER, ['id', 'phone']);
  const members = [];
  m.rows.forEach((r, i) => {
    const id = _dId(m.disp.id[i]);
    if (!id) return;
    members.push(_dMemberRow(m, r, id, m.disp.phone[i]));
  });
  const t = _dRead(ss, D_SHEET.TRANSAKSI, D_TX, ['id']);
  const tx = [];
  t.rows.forEach((r, i) => {
    const at = _dTime(_dGet(t, r, 'at'));
    const id = _dId(t.disp.id[i]);
    if (!at || !id) return;
    tx.push([at, id, String(_dGet(t, r, 'type') || 'Belanja').trim(), _dNum(_dGet(t, r, 'amount')), _dNum(_dGet(t, r, 'stamps')), _dNum(_dGet(t, r, 'balance')), _dText(_dGet(t, r, 'store')), _dText(_dGet(t, r, 'name')), i + 2]);
  });
  const k = _dRead(ss, D_SHEET.TOKO, D_TOKO, []);
  const seen = {};
  const toko = [];
  k.rows.forEach(r => {
    const s = _dText(_dGet(k, r, 'store'));
    if (s && !seen[s.toLowerCase()]) { seen[s.toLowerCase()] = 1; toko.push(s); }
  });
  return { v: DASBOR_VERSION, now: Date.now(), min: set.min, slots: set.slots, batas: set.batas, toko: toko, members: members, tx: tx };
}

function _dEditMember(ss, p) {
  const id = _dId(p.id);
  const name = String(p.name || '').replace(/\s+/g, ' ').trim().replace(/^[=+\-@]+/, '').slice(0, 60);
  const phone = _dPhone(p.phone);
  if (!id) throw _dFail('ID tidak valid');
  if (!name) throw _dFail('Nama wajib diisi');
  if (!/^628\d{7,11}$/.test(phone)) throw _dFail('No. HP tidak valid', 'HP');
  const m = _dRead(ss, D_SHEET.MEMBER, D_MEMBER, ['id', 'phone']);
  let at = -1;
  for (let i = 0; i < m.rows.length; i++) {
    const rid = _dId(m.disp.id[i]);
    if (rid === id) at = i;
    else if (rid && _dPhone(m.disp.phone[i]) === phone) throw _dFail('No. HP sudah dipakai ID ' + rid, 'HP');
  }
  if (at < 0) throw _dFail('Member tidak ditemukan', 'GONE');
  const row = at + 2;
  if (m.col.name) m.sh.getRange(row, m.col.name).setValue(name);
  if (m.col.phone) m.sh.getRange(row, m.col.phone).setNumberFormat('@').setValue(phone);
  const t = _dRead(ss, D_SHEET.TRANSAKSI, D_TX, ['id']);
  if (t.rows.length) {
    ['name', 'phone'].forEach(key => {
      const c = t.col[key];
      if (!c) return;
      const val = key === 'name' ? name : phone;
      let dirty = false;
      const out = t.rows.map((r, i) => {
        if (_dId(t.disp.id[i]) === id && String(r[c - 1]) !== val) { dirty = true; return [val]; }
        return [r[c - 1]];
      });
      if (dirty) t.sh.getRange(2, c, out.length, 1).setValues(out);
    });
  }
  const vals = m.sh.getRange(row, 1, 1, m.width).getValues()[0];
  return { member: _dMemberRow(m, vals, id, phone) };
}

function _dDeleteMember(ss, p) {
  const id = _dId(p.id);
  if (!id) throw _dFail('ID tidak valid');
  const m = _dRead(ss, D_SHEET.MEMBER, D_MEMBER, ['id']);
  for (let i = m.rows.length - 1; i >= 0; i--) {
    if (_dId(m.disp.id[i]) === id) {
      m.sh.deleteRow(i + 2);
      return { id: id };
    }
  }
  throw _dFail('Member tidak ditemukan', 'GONE');
}

function _dCancel(ss, p) {
  const id = _dId(p.id);
  const at = Number(p.at) || 0;
  const amount = _dNum(p.amount);
  if (!id || !at) throw _dFail('Transaksi tidak valid');
  const t = _dRead(ss, D_SHEET.TRANSAKSI, D_TX, ['id']);
  if (!t.col.type) throw _dFail('Kolom Jenis tidak ada di sheet Transaksi', 'SETUP');
  const match = (i) => {
    const r = t.rows[i];
    return r && _dId(t.disp.id[i]) === id && Math.abs(_dTime(_dGet(t, r, 'at')) - at) < 1000 && _dNum(_dGet(t, r, 'amount')) === amount;
  };
  let idx = -1;
  const hint = Number(p.row) - 2;
  if (hint >= 0 && match(hint)) idx = hint;
  for (let i = t.rows.length - 1; i >= 0 && idx < 0; i--) if (match(i)) idx = i;
  if (idx < 0) throw _dFail('Transaksi tidak ditemukan', 'GONE');
  const r = t.rows[idx];
  const type = String(_dGet(t, r, 'type') || '').trim().toLowerCase();
  if (type === 'batal') throw _dFail('Transaksi sudah dibatalkan', 'BATAL');
  if (type && type !== 'belanja') throw _dFail('Hanya transaksi belanja yang bisa dibatalkan');
  const st = _dNum(_dGet(t, r, 'stamps'));

  const m = _dRead(ss, D_SHEET.MEMBER, D_MEMBER, ['id', 'phone']);
  let mi = -1;
  for (let i = 0; i < m.rows.length; i++) if (_dId(m.disp.id[i]) === id) { mi = i; break; }
  let member = null;
  if (mi >= 0) {
    const mr = m.rows[mi];
    const cur = _dNum(_dGet(m, mr, 'stamps'));
    if (cur < st) throw _dFail('Stamp member tinggal ' + cur + ', tidak cukup untuk dibatalkan');
    let last = 0;
    t.rows.forEach((x, i) => {
      if (i === idx || _dId(t.disp.id[i]) !== id) return;
      const ty = String(_dGet(t, x, 'type') || '').trim().toLowerCase();
      if (ty && ty !== 'belanja') return;
      const w = _dTime(_dGet(t, x, 'at'));
      if (w > last) last = w;
    });
    const row = mi + 2;
    const upd = {
      stamps: cur - st,
      spent: Math.max(0, _dNum(_dGet(m, mr, 'spent')) - amount),
      count: Math.max(0, _dNum(_dGet(m, mr, 'count')) - 1),
      lastAt: last ? new Date(last) : ''
    };
    Object.keys(upd).forEach(k => { if (m.col[k]) m.sh.getRange(row, m.col[k]).setValue(upd[k]); });
    const vals = m.sh.getRange(row, 1, 1, m.width).getValues()[0];
    member = _dMemberRow(m, vals, id, m.disp.phone[mi]);
  }
  t.sh.getRange(idx + 2, t.col.type).setValue('Batal');
  return { row: idx + 2, member: member };
}

function _dMemberRow(m, r, id, phone) {
  return [
    id, _dText(_dGet(m, r, 'name')), _dPhone(phone),
    _dNum(_dGet(m, r, 'stamps')), _dNum(_dGet(m, r, 'spent')), _dNum(_dGet(m, r, 'count')),
    _dText(_dGet(m, r, 'store')), _dTime(_dGet(m, r, 'createdAt')), _dTime(_dGet(m, r, 'lastAt'))
  ];
}

function _dRead(ss, name, spec, dispKeys) {
  const sh = ss.getSheetByName(name);
  const empty = { sh: sh, col: {}, width: 0, rows: [], disp: {} };
  dispKeys.forEach(k => { empty.disp[k] = []; });
  if (!sh || sh.getLastRow() < 1) return empty;
  const t = _dTable(sh, spec);
  dispKeys.forEach(k => {
    t.disp[k] = t.col[k] && t.rows.length
      ? sh.getRange(2, t.col[k], t.rows.length, 1).getDisplayValues().map(x => x[0])
      : t.rows.map(() => '');
  });
  return t;
}

function _dTable(sh, spec) {
  const width = Math.max(sh.getLastColumn(), 1);
  const last = sh.getLastRow();
  const head = sh.getRange(1, 1, 1, width).getDisplayValues()[0].map(h => String(h).trim().toLowerCase());
  const col = {};
  Object.keys(spec).forEach(k => {
    for (let j = 0; j < spec[k].length; j++) {
      const i = head.indexOf(spec[k][j]);
      if (i >= 0) { col[k] = i + 1; break; }
    }
  });
  const rows = last >= 2 ? sh.getRange(2, 1, last - 1, width).getValues() : [];
  return { sh: sh, col: col, width: width, rows: rows, disp: {} };
}

function _dLocked(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw _dFail('Server sibuk, coba lagi');
  try {
    const r = fn();
    SpreadsheetApp.flush();
    return r;
  } finally {
    lock.releaseLock();
  }
}

function _dGet(t, r, key) { return t.col[key] ? r[t.col[key] - 1] : ''; }
function _dText(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
function _dNum(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function _dTime(v) {
  if (v instanceof Date) return v.getTime() || 0;
  if (typeof v === 'number') return v > 1e11 ? v : 0;
  const s = String(v || '').trim();
  if (!s) return 0;
  const t = Date.parse(s.replace(' ', 'T'));
  return isFinite(t) ? t : 0;
}
function _dId(raw) {
  const s = String(raw == null ? '' : raw).trim().toUpperCase();
  return /^[A-Z0-9-]{1,40}$/.test(s) ? s : '';
}
function _dPhone(raw) {
  let d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (d.indexOf('62') === 0) d = d.slice(2);
  d = d.replace(/^0+/, '');
  return d ? '62' + d : '';
}
function _dSs() {
  const id = typeof SPREADSHEET_ID !== 'undefined' ? SPREADSHEET_ID : '1iZXLdFJiIfJt_glCwAqgIUrKGZmedTfsLeLSdTZU0e8';
  return SpreadsheetApp.openById(id);
}
function _dFail(msg, code) { const e = new Error(msg); e.loyalin = true; e.code = code || ''; return e; }
