# Loyalin

PWA kasir untuk scan kartu member (QR berisi nomor ID), daftar member baru, dan menambah poin belanja. Setiap Rp 1.000 = 1 poin.

## Alur

1. **Pertama kali buka**: pilih **Toko** (dari sheet `Toko`) dan isi **Kode akses**. Tanpa kode yang benar aplikasi tidak bisa dipakai.
2. **Scan** QR kartu, atau **Ketik ID / HP** (cari pakai ID atau No. HP).
3. **ID belum terdaftar**: isi Nama dan No. HP lalu **Daftar**.
4. **ID terdaftar**: tampil nama, No. HP, dan poin. Ketik nominal belanja, poin yang didapat langsung terlihat, lalu **Simpan**.
5. Sebelum disimpan selalu muncul **Sudah sesuai?**. Ada peringatan jika:
   - nominal ≥ **Batas Belanja**
   - nominal yang sama untuk ID yang sama sudah masuk dalam 2 menit terakhir
6. **Pengaturan**: ganti toko, warna (Oranye / Peach / Mint / Lavender), tema (Terang / Gelap / Otomatis), Install, Keluar.

## Nomor HP

- Kasir cukup mengetik `812…`. Format `0812…`, `62812…`, dan `+62 812…` otomatis disamakan.
- Disimpan sebagai **teks** dengan format `6281234567890`, jadi angka 0 / + tidak hilang di Sheets atau Excel (.xlsx) dan langsung bisa dipakai untuk `wa.me/6281234567890`.
- Ditampilkan sebagai `0812-3456-7890`.
- Satu No. HP hanya untuk satu member.
- ID kartu juga disimpan sebagai teks, sehingga `000123` tidak berubah jadi `123`.

## Spreadsheet

Sheet dibuat otomatis jika belum ada. Kolom dibaca berdasarkan nama header, sehingga kolom tambahan milik Anda tidak disentuh.

| Sheet | Kolom |
|---|---|
| `Member` | ID, Nama, No HP, Poin, Total Belanja, Jumlah Transaksi, Toko Daftar, Terdaftar, Terakhir Belanja |
| `Transaksi` | Waktu, ID, Nama, No HP, Jenis, Belanja, Poin, Saldo Poin, Toko |
| `Toko` | Nama Toko (diisi manual, satu toko per baris) |
| `Pengaturan` | Kode Akses, Rupiah per Poin (1000), Batas Belanja (5000000) |

`Poin` di `Member` adalah saldo terkini. `Transaksi` adalah riwayat lengkap (`Jenis` = `Belanja`; nanti bisa ditambah `Tukar` untuk penukaran poin). **Loyalin Dashbor** cukup membaca dua sheet ini.

## Setup Apps Script

1. Buka spreadsheet → **Extensions → Apps Script**.
2. Ganti seluruh isi `Code.gs` dengan [`apps-script/Code.gs`](apps-script/Code.gs), lalu simpan.
3. Pilih fungsi **`setup`** → **Run** → setujui izin. Sheet `Member`, `Transaksi`, `Toko`, dan `Pengaturan` akan dibuat.
4. Isi sheet **`Toko`** (kolom `Nama Toko`) dan **`Kode Akses`** di sheet **`Pengaturan`**.
5. **Deploy → Manage deployments** → pilih deployment yang URL-nya sudah dipakai (`…AKfycbw_EmBV…/exec`) → ikon pensil → **Version: New version** → **Deploy**.
   Dengan cara ini URL tetap sama, jadi `js/config.js` tidak perlu diubah. Jika membuat deployment baru: *Execute as: Me*, *Who has access: Anyone*, lalu salin URL-nya ke `APPS_SCRIPT_URL` di `js/config.js`.

Jika kode akses diganti di sheet, kasir otomatis diminta memasukkan kode baru.

## Hosting & install

File statis, bisa memakai **GitHub Pages** (Settings → Pages → Deploy from branch). PWA dan kamera butuh HTTPS.

- **Android / Chrome**: Pengaturan → **Install**, atau menu browser → *Install app*.
- **iPhone / Safari**: Share → *Add to Home Screen*.

Scan memakai `BarcodeDetector` bawaan browser; di iPhone memakai [jsQR](https://github.com/cozmo/jsQR) (`js/vendor`, lisensi Apache-2.0).
