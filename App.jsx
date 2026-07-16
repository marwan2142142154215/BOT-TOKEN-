import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

const PUMPFUN = (mint) => `https://pump.fun/${mint}`;
const DEXSCREENER = (mint) => `https://dexscreener.com/solana/${mint}`;
const RUGCHECK = (mint) => `https://rugcheck.xyz/tokens/${mint}`;

function truncateMint(mint) {
  if (!mint) return "-";
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

function timeAgo(iso) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}d`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}j`;
}

function riskMeta(level) {
  switch (level) {
    case "DANGER":
      return { label: "DANGER", cls: "risk-danger" };
    case "WARNING":
      return { label: "WARNING", cls: "risk-warning" };
    case "OK":
      return { label: "OK", cls: "risk-ok" };
    default:
      return { label: "PENDING", cls: "risk-pending" };
  }
}

function useTick(intervalMs) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

function PulseBar({ pulseKey }) {
  const bars = useMemo(() => Array.from({ length: 48 }, (_, i) => i), []);
  return (
    <div className="pulse-bar" key={pulseKey}>
      {bars.map((i) => (
        <span
          key={i}
          className="pulse-tick"
          style={{ animationDelay: `${(i % 12) * 0.09}s` }}
        />
      ))}
    </div>
  );
}

export default function App() {
  const [tokens, setTokens] = useState([]);
  const [maxMcap, setMaxMcap] = useState("");
  const [query, setQuery] = useState("");
  const [connected, setConnected] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const containerRef = useRef(null);

  useTick(1000); // re-render tiap detik biar "waktu lalu" jalan live

  useEffect(() => {
    let mounted = true;

    async function loadInitial() {
      const { data, error } = await supabase
        .from("detected_tokens")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(150);
      if (!error && mounted) setTokens(data || []);
    }
    loadInitial();

    const channel = supabase
      .channel("detected_tokens_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "detected_tokens" },
        (payload) => {
          setTokens((prev) => [payload.new, ...prev].slice(0, 200));
          setPulseKey((k) => k + 1);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "detected_tokens" },
        (payload) => {
          setTokens((prev) =>
            prev.map((t) => (t.mint === payload.new.mint ? payload.new : t))
          );
        }
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = tokens.filter((t) => {
    if (maxMcap && t.pumpfun_market_cap_usd && t.pumpfun_market_cap_usd > Number(maxMcap)) {
      return false;
    }
    if (query) {
      const q = query.toLowerCase();
      const hay = `${t.name || ""} ${t.symbol || ""} ${t.mint || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <div className="brand">
            <span className="brand-mark">◆</span>
            <div>
              <h1>FREECHAT</h1>
              <span className="brand-sub">TOKEN WATCH — pump.fun live feed</span>
            </div>
          </div>
          <div className="status">
            <span className={`dot ${connected ? "dot-live" : "dot-off"}`} />
            {connected ? "LIVE" : "CONNECTING…"}
          </div>
        </div>
        <PulseBar pulseKey={pulseKey} />
      </header>

      <div className="toolbar">
        <input
          className="input"
          placeholder="Cari nama, symbol, atau contract address…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <input
          className="input input-narrow"
          placeholder="Max market cap (USD)"
          value={maxMcap}
          onChange={(e) => setMaxMcap(e.target.value.replace(/[^0-9]/g, ""))}
        />
        <span className="count">{filtered.length} token</span>
      </div>

      <main className="feed" ref={containerRef}>
        {filtered.length === 0 && (
          <div className="empty">
            Belum ada token yang cocok. Feed akan terisi otomatis begitu worker
            mendeteksi listing baru.
          </div>
        )}

        {filtered.map((t) => {
          const risk = riskMeta(t.rugcheck_risk_level);
          return (
            <div className="row" key={t.mint}>
              <div className="row-age">{timeAgo(t.created_at)}</div>

              <div className="row-main">
                <div className="row-title">
                  <span className="symbol">{t.symbol || "?"}</span>
                  <span className="name">{t.name || "Tanpa nama"}</span>
                </div>
                <div className="mint-line">
                  <code>{truncateMint(t.mint)}</code>
                  <button
                    className="copy-btn"
                    onClick={() => navigator.clipboard.writeText(t.mint)}
                    title="Copy contract address"
                  >
                    copy
                  </button>
                </div>
              </div>

              <div className="row-metrics">
                <div className="metric">
                  <span className="metric-label">MCAP awal</span>
                  <span className="metric-value">
                    {t.market_cap_sol ? `${t.market_cap_sol.toFixed(2)} SOL` : "-"}
                  </span>
                </div>
                <div className="metric">
                  <span className="metric-label">MCAP sekarang</span>
                  <span className="metric-value">
                    {t.pumpfun_market_cap_usd
                      ? `$${Math.round(t.pumpfun_market_cap_usd).toLocaleString("id-ID")}`
                      : "-"}
                  </span>
                </div>
                <div className="metric">
                  <span className="metric-label">Status</span>
                  <span className="metric-value">
                    {t.pumpfun_complete ? "Migrated" : "Bonding curve"}
                  </span>
                </div>
              </div>

              <div className={`risk-badge ${risk.cls}`}>
                <span className="risk-score">{t.rugcheck_score ?? "—"}</span>
                <span className="risk-label">{risk.label}</span>
              </div>

              <div className="row-links">
                <a href={PUMPFUN(t.mint)} target="_blank" rel="noreferrer">
                  pump.fun
                </a>
                <a href={DEXSCREENER(t.mint)} target="_blank" rel="noreferrer">
                  dexscreener
                </a>
                <a href={RUGCHECK(t.mint)} target="_blank" rel="noreferrer">
                  rugcheck
                </a>
              </div>
            </div>
          );
        })}
      </main>

      <footer className="footer">
        Ini feed data mentah, bukan sinyal beli. Selalu cek liquidity lock,
        holder distribution, dan mint authority sebelum ambil keputusan.
      </footer>
    </div>
  );
}
