# FREECHAT Token Watch — Web Dashboard

Dashboard React yang nampilin feed token baru dari pump.fun secara **live**, langsung dari Supabase Realtime — begitu worker (`bot.js`) nemu token baru dan simpan ke database, baris baru langsung muncul di layar ini tanpa refresh.

## 1. Setup Supabase (kalau belum)

1. Buat project baru di [supabase.com](https://supabase.com).
2. Buka **SQL Editor**, jalankan isi file `../freechat-token-bot/supabase/schema.sql` (dari folder worker) — ini bikin tabel `detected_tokens` dan aktifin Realtime.
3. Buka **Project Settings → API**, catat:
   - `Project URL` → dipakai di worker (`SUPABASE_URL`) dan web (`VITE_SUPABASE_URL`)
   - `anon public` key → dipakai di **web** (`VITE_SUPABASE_ANON_KEY`) — key ini aman ditaruh di frontend karena cuma bisa SELECT (read-only, diatur lewat Row Level Security)
   - `service_role` key → dipakai di **worker** (`SUPABASE_SERVICE_KEY`) — key ini PUNYA AKSES PENUH, jangan pernah taruh di kode frontend/web, cuma boleh di server/worker

## 2. Jalankan Lokal

```bash
cp .env.example .env
# isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY

npm install
npm run dev
```

Buka `http://localhost:5173` — kalau worker sudah jalan dan nemu token, langsung muncul di sini.

## 3. Deploy ke Vercel

1. Push folder ini ke repo GitHub (file `.env` otomatis di-ignore).
2. Buka [vercel.com](https://vercel.com) → **New Project** → import repo tadi.
3. Vercel otomatis detect ini project Vite. Sebelum deploy, buka **Environment Variables**, tambahkan:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Klik **Deploy** — selesai, dashboard online dengan URL publik.

## 4. Cara Kerja Realtime-nya

- Worker insert row baru ke tabel `detected_tokens` di Supabase.
- Web ini subscribe ke `postgres_changes` (event INSERT & UPDATE) lewat Supabase Realtime.
- Begitu ada perubahan, React state ke-update otomatis, row baru langsung nongol di atas feed dengan animasi masuk + pulse bar di header ikut "berdenyut".

## 5. Catatan Keamanan

- Dashboard ini **read-only publik** (siapa aja yang punya link bisa lihat) — kalau mau private, tambahkan Supabase Auth dan ubah RLS policy jadi `using (auth.uid() is not null)`.
- Jangan pernah expose `service_role` key di web/frontend manapun — itu key yang dipakai worker aja.
