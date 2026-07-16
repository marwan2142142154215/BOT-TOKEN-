# FREECHAT Token Watcher Bot (Telegram)

Bot ini memantau **event pembuatan token baru di pump.fun (Solana)** secara real-time lewat WebSocket resmi PumpPortal, lalu kirim notifikasi ke Telegram — nama, symbol, contract address, creator wallet, dan link cepat ke DexScreener/RugCheck.

⚠️ **Penting:** ini bot NOTIFIKASI, bukan bot prediksi pump. Tidak ada token yang dijamin naik. Selalu cek liquidity lock & holder distribution sebelum ambil keputusan — lihat bagian "Red Flag" di bawah.

---

## 1. Cara Setup

### a) Buat Bot Telegram
1. Buka Telegram, chat ke **@BotFather**.
2. Ketik `/newbot`, ikuti instruksi (kasih nama & username bot).
3. BotFather akan kasih **token** seperti `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` — simpan ini.

### b) Dapatkan Chat ID
1. Chat bot kamu (klik "Start" / kirim pesan apa aja ke bot barusan).
2. Buka browser, akses:
   `https://api.telegram.org/bot<TOKEN_KAMU>/getUpdates`
3. Cari nilai `"chat":{"id": ...}` — itu Chat ID kamu.
   (Kalau mau notif masuk ke grup, invite bot ke grup itu dulu, lalu kirim pesan di grup, baru cek getUpdates lagi — chat ID grup biasanya minus/negatif).

### c) Isi file `.env`
Copy `.env.example` jadi `.env`, isi `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID` dengan punya kamu.

### d) Install & Jalankan
```bash
npm install
node bot.js
```

Kalau berhasil, bot langsung kirim pesan "🤖 FREECHAT Token Watcher aktif" ke Telegram kamu, lalu mulai kirim notifikasi tiap ada token baru yang lolos filter.

---

## 2. Fitur RugCheck & PumpFun Check

Setiap token baru yang lolos filter akan dapat 2 pesan:
1. **Notif instan** — begitu event token dibuat, langsung dikirim (nama, symbol, CA, creator).
2. **Update analisis** (~8 detik kemudian, biar data sempat ke-index):
   - **RugCheck Score** — makin tinggi score = makin berisiko (skala dari RugCheck.xyz), plus daftar risk yang terdeteksi (holder concentration, mint authority masih aktif, dll).
   - **Data pump.fun** — market cap terkini, status masih di bonding curve atau sudah migrasi, dan status "King of the Hill".

Kalau token terlalu baru dan datanya belum ke-index di RugCheck/pump.fun, bot akan bilang "belum ada data" — itu normal, coba cek manual beberapa menit kemudian via link yang dikirim.

---

## 3. Supaya Bot Jalan 24 Jam TANPA Buka Laptop/App Sama Sekali

Penting dipahami dulu: **tidak ada cara bikin bot ini jalan tanpa ada "sesuatu" yang nyala 24/7** — karena dia butuh koneksi WebSocket yang harus tetap terbuka supaya notifikasi real-time bisa masuk. Yang bisa kita atur adalah "sesuatu" itu bukan laptop kamu, tapi server kecil di cloud yang nyala terus sendiri — ini yang bikin efeknya kayak "sekali install, lupain aja, notif tetap masuk".

### Opsi Termudah — Railway.app (gratis untuk skala kecil, tanpa perlu ngerti server)
1. Buat akun di [railway.app](https://railway.app), login pakai GitHub.
2. Upload folder ini ke repo GitHub baru (**jangan upload file `.env`** — sudah otomatis di-ignore lewat `.gitignore`).
3. Di Railway: **New Project → Deploy from GitHub repo** → pilih repo kamu.
4. Di tab **Variables**, masukkan manual:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `MAX_MARKETCAP_USD`
   - `MIN_INITIAL_BUY_SOL`
5. Railway otomatis baca `Procfile` dan jalankan `node bot.js` sebagai worker yang nyala terus.
6. Selesai — bot jalan 24/7 di cloud, laptop kamu boleh dimatikan, notif tetap masuk ke Telegram.

### Opsi Alternatif — VPS + pm2 (kalau butuh kontrol penuh)

Kalau kamu jalanin di laptop sendiri, bot akan mati saat laptop dimatikan/di-sleep. Rekomendasi:

**Opsi A — Pakai VPS murah** (paling stabil, ini yang saya saranin):
- Contango/Vultr/DigitalOcean, mulai dari ~$4-6/bulan.
- Upload folder ini ke VPS, install Node.js, lalu jalankan pakai **pm2** biar auto-restart kalau crash:
  ```bash
  npm install -g pm2
  pm2 start bot.js --name freechat-watcher
  pm2 save
  pm2 startup
  ```

**Opsi B — Tetap di laptop dulu buat testing**, baru pindah ke VPS kalau sudah yakin filter-nya sesuai kebutuhan kamu.

---

## 3. Konfigurasi Filter

Di `.env`:
- `MAX_MARKETCAP_USD` — cuma kirim notif kalau market cap awal token di bawah nilai ini (default 50.000).
- `MIN_INITIAL_BUY_SOL` — filter minimum initial buy dari creator (opsional, default 0 = tidak difilter).

Semua token di pump.fun start dengan bonding curve yang market cap-nya memang kecil di awal — jadi filter market cap paling berguna buat nyaring token yang harganya "melompat" duluan karena banyak initial buy.

---

## 4. Checklist Red Flag Sebelum Ambil Keputusan

Setiap notifikasi masuk, JANGAN langsung beli. Cek dulu via link RugCheck/DexScreener yang ada di pesan:

1. **Liquidity lock/burn** — kalau LP tidak di-lock, creator bisa rug kapan aja.
2. **Holder distribution** — kalau top 10 wallet pegang >50% supply, risiko dump tinggi.
3. **Mint authority** — pastikan sudah di-revoke (kalau belum, supply bisa ditambah kapan saja = inflasi harga).
4. **Volume vs jumlah trader unik** — kalau volume tinggi tapi trader cuma segelintir, kemungkinan wash trading.
5. **Rasio buy vs sell** dalam beberapa menit terakhir — sell mendadak spike = tanda-tanda whale keluar.

Bot ini bikin kamu lihat token baru lebih cepat, tapi keputusan beli/tidak tetap ada di analisis kamu sendiri — dunia micro-cap crypto risikonya sangat tinggi, termasuk kemungkinan rugi total.

---

## 5. Struktur File
```
freechat-token-bot/
├── bot.js          # logic utama bot
├── .env.example    # template env var
├── .env            # (buat sendiri, isi token & chat id kamu)
├── package.json
└── README.md
```
