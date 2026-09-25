# PRD — Chat Realtime Multi-Instance

| | |
|---|---|
| **Produk** | Chat Realtime Multi-Instance |
| **Versi** | 1.0 |
| **Tanggal** | 25 September 2026 |
| **Pemilik Produk** | BenyRonald77 |

---

## 1. Tujuan

Studi kasus **system design** untuk chat realtime yang siap di-scale
horizontal: WebSocket (Socket.IO) dikombinasikan dengan **Redis Pub/Sub**
sebagai adapter, sehingga pesan tetap tersampaikan ke semua penerima
**walau mereka terhubung ke instance server yang berbeda** — masalah klasik
saat men-scale server WebSocket ke lebih dari satu proses/mesin di
belakang load balancer.

### Masalah yang Diselesaikan

Tanpa adapter bersama, Socket.IO hanya mem-broadcast pesan ke client yang
terhubung ke **proses yang sama**. Bila ada 2 instance server (A dan B) di
belakang load balancer, dan pengirim terhubung ke instance A sementara
penerima terhubung ke instance B, pesan tidak akan pernah sampai. Redis
Pub/Sub menjembatani ini: setiap instance subscribe ke channel Redis yang
sama, sehingga event yang di-emit di instance A ikut dipublikasikan ke
Redis dan diterima ulang oleh instance B, lalu diteruskan ke client-nya.

## 2. Fitur MVP

1. **Pesan realtime** — kirim/terima pesan dalam sebuah percakapan (1:1 atau grup) lewat WebSocket, tersampaikan lintas instance server via Redis Pub/Sub adapter.
2. **Status online** — indikator online/offline per pengguna, dihitung dari jumlah koneksi socket aktif (disimpan di Redis, bukan di memori proses, agar akurat lintas instance & multi-tab).
3. **Tanda "sudah dibaca"** — pengirim melihat pesannya sudah dibaca penerima.
4. **Indikator mengetik** — "X sedang mengetik..." saat lawan bicara mengetik.
5. **Riwayat pesan dengan cursor pagination** — memuat pesan lama secara bertahap (infinite scroll ke atas) tanpa masalah offset-based pagination (duplikat/lewat saat data baru masuk).

## 3. Kebutuhan Fungsional

| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-1 | Pesan yang dikirim klien di instance server A diterima klien di instance server B (dibuktikan dengan menjalankan 2 instance sekaligus) | Must |
| FR-2 | Status online dihitung dari jumlah koneksi socket aktif per pengguna di Redis (bukan variabel in-memory proses) — akurat walau pengguna buka banyak tab/perangkat atau tersambung ke instance berbeda | Must |
| FR-3 | Tanda "sudah dibaca" tersinkron ke semua partisipan percakapan lintas instance | Must |
| FR-4 | Indikator mengetik bersifat ephemeral (tidak disimpan ke database), otomatis hilang beberapa detik setelah berhenti mengetik | Should |
| FR-5 | Riwayat pesan dimuat dengan cursor (id pesan terakhir yang sudah dimuat), bukan offset angka, agar konsisten walau ada pesan baru masuk saat scroll | Must |

## 4. Kebutuhan Non-Fungsional

| Kategori | Kebutuhan |
|---|---|
| **Skalabilitas** | Server chat bisa dijalankan sebagai banyak instance stateless di belakang load balancer; satu-satunya state bersama adalah Redis & database |
| **Keandalan** | Diskoneksi/reconnect klien tidak boleh menghasilkan status online yang keliru (dicek lewat penghitung koneksi, bukan flag boolean sederhana) |
| **Autentikasi** | Koneksi WebSocket diautentikasi lewat sesi login (cookie JWT) yang sama dengan REST API |

## 5. Arsitektur Teknis

```
Client A ──ws──▶ Instance Server 1 ─┐
                                      ├──▶ Redis (Pub/Sub adapter Socket.IO
Client B ──ws──▶ Instance Server 2 ─┘      + penghitung presence online)
```

- Next.js (TypeScript) dengan **custom server** yang membungkus Socket.IO (pola sama seperti proyek Sistem Antrean Klinik Realtime), ditambah `@socket.io/redis-adapter` agar broadcast antar-room bekerja lintas instance.
- Redis dipakai untuk dua hal terpisah: (1) adapter Socket.IO untuk broadcast lintas instance, (2) penghitung koneksi aktif per pengguna untuk status online.
- Database (Prisma/SQLite-PostgreSQL) menyimpan data persisten: pengguna, percakapan, partisipan, pesan, dan `lastReadAt` per partisipan. Status online & indikator mengetik bersifat ephemeral, tidak disimpan ke database.
- Cursor pagination: query Prisma `cursor` berbasis `id` pesan (dibuat dengan `cuid()` yang urut secara waktu pembuatan cukup untuk kebutuhan ini digabung `createdAt` sebagai index).

## 6. Kriteria Penerimaan

- [ ] Dua instance server dijalankan di port berbeda, terhubung ke Redis yang sama; pesan dari klien di instance 1 diterima klien di instance 2 secara realtime.
- [ ] Status online seorang pengguna tetap akurat walau ia membuka 2 tab (status baru berubah offline setelah **kedua** tab ditutup).
- [ ] Tanda sudah dibaca yang di-trigger di satu instance terlihat oleh partisipan lain yang terhubung ke instance berbeda.
- [ ] Scroll ke atas memuat pesan lama lewat cursor tanpa duplikat/lewat pesan.

## 7. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Redis mati → seluruh broadcast realtime lintas instance berhenti | Di luar lingkup MVP untuk high-availability Redis (mis. Redis Sentinel/Cluster); didokumentasikan sebagai single point of failure yang perlu ditangani di production |
| Race condition penghitung presence (dua event connect/disconnect nyaris bersamaan) | Increment/decrement dilakukan lewat operasi atomik Redis (`INCR`/`DECR`), bukan read-then-write |
| Klien reconnect berkali-kali dalam waktu singkat memicu status online/offline "berkedip" | Di luar lingkup MVP; production sebaiknya menambah debounce singkat sebelum menyiarkan status offline |
