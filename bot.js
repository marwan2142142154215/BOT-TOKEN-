require("dotenv").config();
const WebSocket = require("ws");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

// ================== SUPABASE ==================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

if (!supabase) {
  console.warn(
    "⚠️ SUPABASE_URL / SUPABASE_SERVICE_KEY belum diset — data tidak akan disimpan ke Supabase, tapi Telegram tetap jalan normal."
  );
}

// ================== KONFIGURASI ==================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Filter — sesuaikan sesuai selera. Nilai default longgar karena
// hampir semua token baru di pump.fun memang start dengan market cap kecil.
const FILTERS = {
  maxMarketCapUsd: Number(process.env.MAX_MARKETCAP_USD || 50000), // market cap awal maksimum
  minInitialBuySol: Number(process.env.MIN_INITIAL_BUY_SOL || 0), // 0 = tidak filter buy awal
};

const PUMPPORTAL_WSS = "wss://pumpportal.fun/api/data";
const RECONNECT_DELAY_MS = 5000;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error(
    "❌ TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID belum diset di file .env"
  );
  process.exit(1);
}

// ================== TELEGRAM ==================
async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("⚠️ Gagal kirim ke Telegram:", data.description);
    }
  } catch (err) {
    console.error("⚠️ Error kirim Telegram:", err.message);
  }
}

// ================== RUGCHECK & PUMPFUN DATA ==================
// RugCheck: skor risiko resmi (holder concentration, mint/freeze authority, LP lock, dll)
async function getRugCheckSummary(mint) {
  try {
    const res = await fetch(
      `https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      score: data.score,
      riskLevel: data.score >= 8000 ? "🔴 DANGER" : data.score >= 3000 ? "🟠 WARNING" : "🟢 OK",
      risks: (data.risks || []).slice(0, 3).map((r) => r.name),
    };
  } catch {
    return null;
  }
}

// Data langsung dari pump.fun: market cap real-time, progress bonding curve, dev holding
async function getPumpFunData(mint) {
  try {
    const res = await fetch(`https://frontend-api.pump.fun/coins/${mint}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      marketCapUsd: data.usd_market_cap,
      complete: data.complete, // true = sudah migrasi keluar dari bonding curve pump.fun
      replyCount: data.reply_count,
      kingOfHill: !!data.king_of_the_hill_timestamp,
    };
  } catch {
    return null;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ================== FORMAT PESAN ==================
async function buildAndSendMessage(token) {
  const { name, symbol, mint, marketCapSol, initialBuy, solAmount, traderPublicKey } = token;

  const dexscreenerLink = `https://dexscreener.com/solana/${mint}`;
  const pumpfunLink = `https://pump.fun/${mint}`;
  const rugcheckLink = `https://rugcheck.xyz/tokens/${mint}`;

  let text =
    `🆕 <b>TOKEN BARU TERDETEKSI</b>\n\n` +
    `<b>Nama:</b> ${escapeHtml(name || "-")}\n` +
    `<b>Symbol:</b> ${escapeHtml(symbol || "-")}\n` +
    `<b>Contract Address:</b>\n<code>${mint}</code>\n\n` +
    `<b>Market Cap awal:</b> ${marketCapSol ? marketCapSol.toFixed(2) + " SOL" : "-"}\n` +
    `<b>Initial Buy:</b> ${initialBuy || "-"} (${solAmount ? solAmount.toFixed(3) + " SOL" : "-"})\n` +
    `<b>Creator Wallet:</b>\n<code>${traderPublicKey || "-"}</code>\n\n`;

  // simpan row awal ke Supabase (kalau dikonfigurasi)
  if (supabase) {
    const { error } = await supabase.from("detected_tokens").upsert(
      {
        mint,
        name,
        symbol,
        creator_wallet: traderPublicKey,
        market_cap_sol: marketCapSol,
        initial_buy: initialBuy,
        sol_amount: solAmount,
      },
      { onConflict: "mint" }
    );
    if (error) console.error("⚠️ Gagal insert Supabase:", error.message);
  }

  // kirim dulu notif dasar secepatnya
  await sendTelegramMessage(
    text +
      `⏳ <i>Sedang cek RugCheck & data pump.fun, update menyusul...</i>\n\n` +
      `🔗 <a href="${pumpfunLink}">Pump.fun</a> | <a href="${dexscreenerLink}">DexScreener</a>`
  );

  // tunggu beberapa detik supaya data ter-index, baru cek skor
  await delay(8000);

  const [rug, pump] = await Promise.all([
    getRugCheckSummary(mint),
    getPumpFunData(mint),
  ]);

  // update row Supabase dengan hasil analisis
  if (supabase && (rug || pump)) {
    const { error } = await supabase
      .from("detected_tokens")
      .update({
        rugcheck_score: rug?.score ?? null,
        rugcheck_risk_level: rug?.riskLevel?.replace(/[^A-Z]/g, "") ?? null,
        rugcheck_risks: rug?.risks ?? null,
        pumpfun_market_cap_usd: pump?.marketCapUsd ?? null,
        pumpfun_complete: pump?.complete ?? null,
        pumpfun_king_of_hill: pump?.kingOfHill ?? null,
      })
      .eq("mint", mint);
    if (error) console.error("⚠️ Gagal update Supabase:", error.message);
  }

  let followUp = `📊 <b>UPDATE ANALISIS</b> — ${escapeHtml(symbol || "-")}\n<code>${mint}</code>\n\n`;

  if (rug) {
    followUp +=
      `<b>RugCheck Score:</b> ${rug.score} (${rug.riskLevel})\n` +
      (rug.risks.length ? `<b>Risk terdeteksi:</b> ${rug.risks.map(escapeHtml).join(", ")}\n` : "");
  } else {
    followUp += `<b>RugCheck:</b> belum ada data (token masih terlalu baru)\n`;
  }

  if (pump) {
    followUp +=
      `<b>Market Cap sekarang:</b> ${pump.marketCapUsd ? "$" + Math.round(pump.marketCapUsd).toLocaleString("id-ID") : "-"}\n` +
      `<b>Status:</b> ${pump.complete ? "Sudah migrasi keluar dari bonding curve" : "Masih di bonding curve pump.fun"}\n` +
      `<b>King of the Hill:</b> ${pump.kingOfHill ? "✅ ya" : "belum"}\n`;
  } else {
    followUp += `<b>Data pump.fun:</b> belum tersedia\n`;
  }

  followUp +=
    `\n🔗 <a href="${pumpfunLink}">Pump.fun</a> | <a href="${dexscreenerLink}">DexScreener</a> | <a href="${rugcheckLink}">RugCheck</a>\n\n` +
    `⚠️ <i>Tetap bukan sinyal beli. Score tinggi = risiko tinggi, tapi score rendah pun tidak menjamin aman.</i>`;

  await sendTelegramMessage(followUp);
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ================== FILTER LOGIC ==================
function passesFilter(token) {
  if (token.txType !== "create") return false; // hanya event pembuatan token baru

  if (
    FILTERS.maxMarketCapUsd &&
    token.marketCapSol &&
    token.solPriceUsd &&
    token.marketCapSol * token.solPriceUsd > FILTERS.maxMarketCapUsd
  ) {
    return false;
  }

  if (
    FILTERS.minInitialBuySol &&
    token.solAmount &&
    token.solAmount < FILTERS.minInitialBuySol
  ) {
    return false;
  }

  return true;
}

// ================== WEBSOCKET CONNECTION ==================
let ws;
let pingInterval;

function connect() {
  console.log("🔌 Menghubungkan ke PumpPortal...");
  ws = new WebSocket(PUMPPORTAL_WSS);

  ws.on("open", () => {
    console.log("✅ Terhubung. Subscribe ke event token baru...");
    ws.send(JSON.stringify({ method: "subscribeNewToken" }));

    // jaga koneksi tetap hidup
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 30000);
  });

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Abaikan pesan konfirmasi subscribe
    if (msg.message) {
      console.log("ℹ️", msg.message);
      return;
    }

    if (passesFilter(msg)) {
      console.log(`🆕 Token baru lolos filter: ${msg.symbol} (${msg.mint})`);
      // tidak di-await supaya tidak nge-block event token berikutnya yang masuk bersamaan
      buildAndSendMessage(msg).catch((err) =>
        console.error("Error proses token:", err.message)
      );
    }
  });

  ws.on("close", () => {
    console.warn(
      `⚠️ Koneksi terputus. Reconnect dalam ${RECONNECT_DELAY_MS / 1000}s...`
    );
    clearInterval(pingInterval);
    setTimeout(connect, RECONNECT_DELAY_MS);
  });

  ws.on("error", (err) => {
    console.error("❌ WebSocket error:", err.message);
    ws.close();
  });
}

connect();

// Kirim notifikasi startup ke Telegram supaya kamu tau bot jalan
sendTelegramMessage(
  "🤖 <b>FREECHAT Token Watcher aktif.</b>\nMemantau token baru di pump.fun (Solana) secara real-time."
);
