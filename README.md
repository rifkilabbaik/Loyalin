# Loyalin

PWA kasir untuk scan kartu member (QR berisi nomor ID), daftar member baru, dan memberi **stamp**: belanja minimal Rp 13.000 dapat **1 stamp per transaksi** (tidak berlaku kelipatan).

## Alur

1. **Pertama kali buka**: pilih **Toko** lalu isi **Kode akses** toko itu (dari sheet `Toko`). Tanpa kode yang benar aplikasi tidak bisa dipakai.
2. **Scan** QR kartu, atau **Ketik ID / HP** (cari pakai ID atau No. HP).
3. **ID belum terdaftar**: isi Nama dan No. HP lalu **Daftar**.
4. **ID terdaftar**: tampil nama, No. HP, dan **kartu stamp** (10 slot, slot terakhir = hadiah). Ketik nominal belanja:
   - di bawah Rp 13.000: terkunci, tombol Simpan mati
   - Rp 13.000 ke atas: stamp bayangan berdenyut di slot berikutnya, **+1 → 4/10**, lalu **Simpan**
5. Sebelum disimpan selalu muncul **Sudah sesuai?**. Ada peringatan jika:
   - nominal ≥ **Batas Belanja**
   - ID yang sama sudah dapat stamp dalam 10 menit terakhir (mencegah transaksi dipecah)
6. **Berhasil**: alat cap turun dan mengecap slot berikutnya. Jika kartu penuh (10/10), slot hadiah menyala dan muncul lencana hadiah **×1**. Stamp ke-11 mulai di kartu baru (1/10, hadiah ×1 tetap tampil).
7. **Pengaturan**: ganti toko (wajib memasukkan kode akses toko tujuan), warna (Oranye / Peach / Mint / Lavender), tema (Terang / Gelap / Otomatis), **suara** (Nyala / Mati), Install, Keluar.

## Efek suara

Dibuat langsung oleh browser (Web Audio), tanpa file audio: scan berhasil, stamp siap (nominal cukup), *dok* saat dicap, *ting* setelah stamp masuk, fanfare saat kartu penuh, nada peringatan, dan nada error. Bisa dimatikan di Pengaturan.

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
| `Member` | ID, Nama, No HP, Stamp, Total Belanja, Jumlah Transaksi, Toko Daftar, Terdaftar, Terakhir Belanja |
| `Transaksi` | Waktu, ID, Nama, No HP, Jenis, Belanja, Stamp, Saldo Stamp, Toko |
| `Toko` | Nama Toko, Kode Akses (diisi manual, satu toko per baris) |
| `Pengaturan` | Minimal Belanja (13000), Stamp per Kartu (10), Batas Belanja (5000000), Kode Admin (untuk Dasbor) |

`Stamp` di `Member` adalah total stamp terkini. Kartu ke-n dihitung dari total ini: 23 stamp = 2 kartu penuh (hadiah ×2) + 3/10. `Transaksi` adalah riwayat lengkap (`Jenis` = `Belanja`, `Stamp` = 1; nanti bisa ditambah `Tukar` dengan stamp negatif). **Loyalin Dashbor** cukup membaca dua sheet ini.

`Minimal Belanja` berlaku **≥** (Rp 13.000 pas dapat stamp). Jika maksudnya harus lebih dari Rp 13.000, isi `13001`. Kolom `Poin` dari versi lama tetap terbaca sebagai `Stamp`; sebaiknya ganti judulnya menjadi `Stamp` dan kosongkan angka poin lama.

## Setup Apps Script

1. Buka spreadsheet → **Extensions → Apps Script**.
2. Ganti seluruh isi `Code.gs` dengan [`apps-script/Code.gs`](apps-script/Code.gs), lalu simpan.
3. Pilih fungsi **`setup`** → **Run** → setujui izin. Sheet `Member`, `Transaksi`, `Toko`, dan `Pengaturan` akan dibuat.
4. Isi sheet **`Toko`**: kolom A `Nama Toko`, kolom B `Kode Akses`. Setiap toko punya kodenya sendiri. Toko tanpa kode tidak bisa dipakai.
   Kolom `Kode Akses` yang dibuat oleh `setup` berformat teks, jadi kode seperti `0123` tidak berubah. Jika sheet `Toko` dibuat sendiri, format kolom B sebagai **Plain text** (Format → Number → Plain text).
5. **Deploy → Manage deployments** → pilih deployment yang URL-nya sudah dipakai (`…AKfycbw_EmBV…/exec`) → ikon pensil → **Version: New version** → **Deploy**.
   Dengan cara ini URL tetap sama, jadi `js/config.js` tidak perlu diubah. Jika membuat deployment baru: *Execute as: Me*, *Who has access: Anyone*, lalu salin URL-nya ke `APPS_SCRIPT_URL` di `js/config.js`.

Jika kode akses suatu toko diganti di sheet, kasir di toko itu otomatis diminta memasukkan kode baru.

### Loyalin Dasbor

Dasbor memakai project Apps Script yang sama, lewat file [`apps-script/Dasbor.gs`](apps-script/Dasbor.gs) di repo ini:

1. Di editor Apps Script: **+ → Script**, beri nama `Dasbor`, lalu tempel isi `apps-script/Dasbor.gs`. Jangan digabung ke `Code.gs`.
2. Jalankan fungsi **`setupDasbor`** sekali. Baris `Kode Admin` akan ditambahkan ke sheet `Pengaturan`; isi kodenya (format teks).
3. **Deploy → Manage deployments → New version** (URL tetap sama).

Aksi berawalan `dasbor` (`dasbor`, `dasborMember`, `dasborHapus`, `dasborBatal`) hanya bisa dipakai dengan Kode Admin. Data yang dikirim: `min`, `slots`, `batas`, `toko`, `members` (`[id, nama, hp, stamp, total belanja, jumlah transaksi, toko daftar, terdaftar, terakhir belanja]`), dan `tx` (`[waktu, id, jenis, belanja, stamp, saldo stamp, toko, nama, baris]`). Transaksi yang dibatalkan dari Dasbor berubah jadi Jenis `Batal`, stamp member berkurang 1, dan tidak memicu peringatan dobel di kasir. Tanpa `Dasbor.gs`, aplikasi kasir tetap berjalan normal.

## Hosting & install

File statis, bisa memakai **GitHub Pages** (Settings → Pages → Deploy from branch). PWA dan kamera butuh HTTPS.

- **Android / Chrome**: Pengaturan → **Install**, atau menu browser → *Install app*.
- **iPhone / Safari**: Share → *Add to Home Screen*.

Scan memakai `BarcodeDetector` bawaan browser; di iPhone memakai [jsQR](https://github.com/cozmo/jsQR) (`js/vendor`, lisensi Apache-2.0).
