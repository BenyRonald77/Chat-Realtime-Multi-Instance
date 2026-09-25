# Chat Realtime Multi-Instance

Studi kasus system design: chat realtime (WebSocket/Socket.IO) yang siap
di-scale horizontal lewat **Redis Pub/Sub adapter**, dilengkapi status
online, tanda "sudah dibaca", indikator mengetik, dan riwayat pesan dengan
cursor pagination.

Lihat dokumen perencanaan lengkap di [`docs/PRD.md`](./docs/PRD.md).

## Masalah yang Diselesaikan

Tanpa adapter bersama, Socket.IO hanya mem-broadcast ke client yang
terhubung ke **proses server yang sama**. Begitu ada 2+ instance di
belakang load balancer, pesan dari pengirim di instance A tidak akan
pernah sampai ke penerima di instance B. Proyek ini memasang
`@socket.io/redis-adapter` sehingga semua broadcast (pesan baru, typing,
read receipt) otomatis disiarkan lewat Redis dan diterima ulang oleh
**semua** instance yang subscribe.

## Bukti Nyata: Verifikasi Lintas-Instance

Ini **sudah diuji sungguhan**, bukan cuma diklaim — dengan menjalankan dua
proses server terpisah (`PORT=3001` dan `PORT=3002`) yang berbagi Redis dan
database yang sama, lalu menghubungkan satu klien ke masing-masing
instance:

```bash
redis-server --daemonize yes
PORT=3001 npm run dev          # terminal 1, dari direktori ini
PORT=3002 npm run dev          # terminal 2, dari SALINAN direktori proyek
                                # (Next.js dev mode tidak boleh berbagi
                                #  cache .next antar proses berbeda)
npx tsx scripts/verify-multi-instance.ts
```

Hasil aktual saat dikembangkan — **keempatnya lulus**:

- ✅ Pesan dari klien di instance 3001 diterima klien di instance 3002.
- ✅ Indikator mengetik tersiar lintas instance.
- ✅ Tanda "sudah dibaca" tersiar lintas instance.
- ✅ Status online terdeteksi lintas instance (dihitung dari Redis, bukan
  variabel in-memory proses).

## Fitur Utama

- **Pesan realtime lintas instance** via Socket.IO + Redis adapter.
- **Status online** — dihitung dari jumlah koneksi socket aktif per pengguna di Redis (`INCR`/`DECR` atomik), akurat walau multi-tab atau tersambung ke instance berbeda.
- **Tanda sudah dibaca** — `lastReadAt` per partisipan, disiarkan ke seluruh percakapan saat berubah.
- **Indikator mengetik** — ephemeral (tidak disimpan ke database), otomatis berhenti 2 detik setelah user berhenti mengetik.
- **Riwayat pesan cursor-based** — memuat pesan lama tanpa duplikat/lewat walau ada pesan baru masuk saat scroll.

## Menjalankan Secara Lokal (Satu Instance)

```bash
npm install
cp .env.example .env
# pastikan Redis berjalan: redis-server --daemonize yes
npm run prisma:migrate   # migrasi + seed (3 user, 1 percakapan contoh)
npm run dev
```

Buka `http://localhost:3000/login`. Akun demo:
- `gita@chat.test` / `gita123`
- `hadi@chat.test` / `hadi123`
- `ivan@chat.test` / `ivan123`

## Arsitektur

```
Client A ──ws──▶ Instance Server 1 ─┐
                                      ├──▶ Redis (adapter Socket.IO
Client B ──ws──▶ Instance Server 2 ─┘      + penghitung presence)
```

- `server/index.ts` — custom server Next.js + Socket.IO, memasang `@socket.io/redis-adapter` dan mengautentikasi koneksi WebSocket lewat cookie sesi JWT yang sama dengan REST API.
- `server/chat-handlers.ts` — event handler Socket.IO (kirim pesan, join percakapan, typing, read receipt, presence).
- `src/lib/session-token.ts` — logika JWT murni tanpa dependensi `next/headers`, dipakai `server/index.ts` (lihat catatan penting di bawah).
- `src/lib/presence.ts` — penghitung koneksi aktif per pengguna di Redis.
- `src/lib/chat-service.ts` — logika percakapan/pesan (dipakai REST API & socket handler), termasuk cursor pagination.

## Catatan Penting: Kenapa `session-token.ts` Terpisah dari `auth.ts`

`server/index.ts` dijalankan langsung lewat `tsx`, **di luar** pipeline
request Next.js. Kalau file itu mengimpor sesuatu yang memuat
`next/headers` (seperti `auth.ts` yang punya `getSession()`), Next.js akan
menginisialisasi modul internal `AsyncLocalStorage`-nya dua kali dengan
cara berbeda — satu lewat `tsx` yang me-load source TypeScript Next.js
secara langsung, satu lagi lewat pipeline resmi Next.js saat menangani
request. Begitu request API sungguhan masuk, kedua instance modul ini
bentrok dan melempar error `Invariant: AsyncLocalStorage accessed in
runtime where it is not available`. Solusinya: `verifySession`/`signSession`
dipisah ke `session-token.ts` yang sama sekali tidak menyentuh
`next/headers`, aman diimpor `server/index.ts`. `auth.ts` (dipakai oleh
route handler Next.js, yang di-load lewat pipeline resminya) tetap
mengimpor `next/headers` seperti biasa.

## Struktur Proyek

```
docs/PRD.md                            Dokumen PRD & diagram arsitektur
prisma/schema.prisma                   Skema (user, percakapan, partisipan, pesan)
server/index.ts                         Custom server: Socket.IO + Redis adapter + auth
server/chat-handlers.ts                 Event handler realtime
scripts/verify-multi-instance.ts        Skrip verifikasi lintas-instance
src/lib/chat-service.ts                 Logika percakapan & cursor pagination
src/lib/presence.ts                     Penghitung online berbasis Redis
src/app/chat                            UI chat
```

## Deployment

1. Set `DATABASE_URL` ke PostgreSQL untuk production, `JWT_SECRET`, dan `REDIS_URL` mengarah ke Redis production (mis. Redis Cloud/ElastiCache).
2. Build: `npm run build`, jalankan: `npm start` — bisa dijalankan sebagai **banyak instance stateless** di belakang load balancer WebSocket-aware (sticky session TIDAK wajib untuk broadcast lintas instance berkat Redis adapter, tapi reconnect klien akan lebih mulus dengan sticky session di layer load balancer).
3. Redis menjadi single point of failure untuk broadcast realtime — pertimbangkan Redis Sentinel/Cluster untuk high-availability di production sungguhan (di luar lingkup MVP ini).

## Catatan Keamanan

- Password di-hash dengan bcrypt; koneksi WebSocket diautentikasi lewat cookie JWT yang sama dengan REST API (bukan token terpisah yang mudah bocor).
- Setiap akses ke percakapan (kirim pesan, join room, baca riwayat) divalidasi lewat `isParticipant()` — pengguna tidak bisa membaca/mengirim ke percakapan yang bukan miliknya.
