import { useState, useEffect, useRef, useCallback } from "react";
import {
  Evaluate,
  GetAuditTrail,
  GetCommitRateHistory,
  GetDefaultPolicy,
  ClearAudit,
  GetDriftStats,
  ExportCSV,
  ExportJSON,
  GenerateCandidate,
} from "../wailsjs/go/main/App";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, AreaChart, Area
} from "recharts";

// ─── THEME TOKENS ──────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg:        "#080b10",
    surface:   "#0d1117",
    panel:     "#111820",
    border:    "#1e2d3d",
    borderAcc: "#2a4060",
    text:      "#c9d8e8",
    textMuted: "#4a6580",
    textDim:   "#2a3d52",
    accent:    "#38bdf8",
    green:     "#34d399",
    red:       "#f87171",
    yellow:    "#fbbf24",
    orange:    "#fb923c",
    scanline:  "rgba(56,189,248,0.02)",
    glow:      "0 0 20px rgba(56,189,248,0.08)",
  },
  light: {
    bg:        "#f0f4f8",
    surface:   "#ffffff",
    panel:     "#f8fafc",
    border:    "#cbd5e1",
    borderAcc: "#94a3b8",
    text:      "#1e293b",
    textMuted: "#64748b",
    textDim:   "#94a3b8",
    accent:    "#0284c7",
    green:     "#059669",
    red:       "#dc2626",
    yellow:    "#d97706",
    orange:    "#ea580c",
    scanline:  "transparent",
    glow:      "0 1px 3px rgba(0,0,0,0.08)",
  },
};

// ─── THREAT COLORS ────────────────────────────────────────────────────────────
const threatColor = (level, t) => ({
  NORMAL:     t.green,
  WARNING:    t.yellow,
  ESCALATION: t.orange,
  BLOCK:      t.red,
}[level] || t.textMuted);

const threatBg = (level) => ({
  NORMAL:     "rgba(52,211,153,0.06)",
  WARNING:    "rgba(251,191,36,0.08)",
  ESCALATION: "rgba(251,146,60,0.1)",
  BLOCK:      "rgba(248,113,113,0.12)",
}[level] || "transparent");

// ─── MONO FONT ────────────────────────────────────────────────────────────────
const MONO = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace";

export default function App() {
  const [themeName, setThemeName] = useState("dark");
  const t = THEMES[themeName];

  const [policy,    setPolicy]    = useState("");
  const [candidate, setCandidate] = useState("");
  const [result,    setResult]    = useState(null);
  const [audit,     setAudit]     = useState([]);
  const [chartData, setChartData] = useState([]);
  const [drift,     setDrift]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab,  setActiveTab]  = useState("audit"); // "audit" | "drift"

  const dropRef = useRef(null);

  useEffect(() => {
    GetDefaultPolicy().then(setPolicy);
  }, []);

  const refreshData = async () => {
    const trail  = await GetAuditTrail();
    const rates  = await GetCommitRateHistory();
    const dStats = await GetDriftStats();
    setAudit(trail.slice().reverse());
    setChartData(rates.map((v, i) => ({ i, rate: v, baseline: dStats.baseline })));
    setDrift(dStats);
  };

  const evaluate = async () => {
    if (!candidate.trim()) return;
    setLoading(true);
    const r = await Evaluate(candidate, policy);
    setResult(r);
    await refreshData();
    setLoading(false);
  };

  const clear = async () => {
    await ClearAudit();
    setAudit([]);
    setChartData([]);
    setResult(null);
    setDrift(null);
  };

  // ── Drag & Drop YAML ────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext !== "yaml" && ext !== "yml") {
      setExportMsg("⚠ Only .yaml / .yml files accepted");
      setTimeout(() => setExportMsg(""), 3000);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPolicy(ev.target.result);
      setExportMsg(`✓ Loaded: ${file.name}`);
      setTimeout(() => setExportMsg(""), 3000);
    };
    reader.readAsText(file);
  }, []);

  // ── Export ──────────────────────────────────────────────────────────────────
  const exportCSV = async () => {
    if (!audit.length) return;
    const path = `dcl_audit_${Date.now()}.csv`;
    const res = await ExportCSV(path);
    setExportMsg(res.startsWith("OK:") ? `✓ CSV → ${res.slice(3)}` : res);
    setTimeout(() => setExportMsg(""), 4000);
  };

  const exportJSON = async () => {
    if (!audit.length) return;
    const path = `dcl_audit_${Date.now()}.json`;
    const res = await ExportJSON(path);
    setExportMsg(res.startsWith("OK:") ? `✓ JSON → ${res.slice(3)}` : res);
    setTimeout(() => setExportMsg(""), 4000);
  };

  // ─── STYLES ────────────────────────────────────────────────────────────────
  const s = {
    root: {
      display: "flex",
      height: "100vh",
      background: t.bg,
      color: t.text,
      fontFamily: MONO,
      fontSize: 12,
      overflow: "hidden",
      transition: "background 0.3s, color 0.3s",
    },
    label: {
      color: t.accent,
      fontWeight: 700,
      fontSize: 10,
      letterSpacing: "0.15em",
      textTransform: "uppercase",
      marginBottom: 6,
    },
    panel: (extra = {}) => ({
      background: t.panel,
      border: `1px solid ${t.border}`,
      borderRadius: 4,
      ...extra,
    }),
    textarea: (extra = {}) => ({
      background: t.surface,
      color: t.text,
      border: `1px solid ${t.border}`,
      borderRadius: 4,
      padding: 10,
      fontSize: 12,
      fontFamily: MONO,
      resize: "none",
      outline: "none",
      transition: "border-color 0.2s",
      ...extra,
    }),
    btn: (active = false, color = t.accent, extra = {}) => ({
      background: active ? color : "transparent",
      color: active ? "#000" : color,
      border: `1px solid ${color}`,
      borderRadius: 3,
      padding: "6px 14px",
      fontSize: 10,
      fontFamily: MONO,
      fontWeight: 700,
      letterSpacing: "0.1em",
      cursor: "pointer",
      transition: "all 0.15s",
      ...extra,
    }),
    divider: {
      width: 1,
      background: t.border,
      flexShrink: 0,
    },
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Google Font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap"
      />

      <div style={s.root}>

        {/* ══ LEFT: Policy Editor ════════════════════════════════════════════ */}
        <div
          ref={dropRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            width: 280,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: isDragging
              ? `linear-gradient(135deg, ${t.panel}, rgba(56,189,248,0.06))`
              : t.panel,
            borderRight: `1px solid ${isDragging ? t.accent : t.border}`,
            transition: "all 0.2s",
            position: "relative",
          }}
        >
          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={s.label}>POLICY YAML</span>
            <button
              style={s.btn(themeName === "light", t.accent, { padding: "3px 8px", fontSize: 9 })}
              onClick={() => setThemeName(n => n === "dark" ? "light" : "dark")}
            >
              {themeName === "dark" ? "☀ LIGHT" : "☾ DARK"}
            </button>
          </div>

          {/* Drop hint */}
          <div style={{
            fontSize: 9,
            color: isDragging ? t.accent : t.textDim,
            letterSpacing: "0.08em",
            transition: "color 0.2s",
            marginBottom: 2,
          }}>
            {isDragging ? "▼ DROP .yaml FILE" : "↓ DRAG & DROP .yaml / .yml"}
          </div>

          <textarea
            value={policy}
            onChange={e => setPolicy(e.target.value)}
            style={s.textarea({ flex: 1, lineHeight: 1.6 })}
            spellCheck={false}
          />

          {/* Drop overlay */}
          {isDragging && (
            <div style={{
              position: "absolute", inset: 0,
              border: `2px dashed ${t.accent}`,
              borderRadius: 4,
              pointerEvents: "none",
              background: "rgba(56,189,248,0.04)",
            }} />
          )}
        </div>

        <div style={s.divider} />

        {/* ══ CENTER: Evaluate ═══════════════════════════════════════════════ */}
        <div style={{ flex: 1, padding: 14, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>

          {/* Title bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ ...s.label, marginBottom: 0 }}>DCL EVALUATOR</div>
            <div style={{ flex: 1, height: 1, background: t.border }} />
            <div style={{ fontSize: 9, color: t.textMuted, letterSpacing: "0.12em" }}>
              v1.0.0 · FRONESIS LABS
            </div>
          </div>

          <div style={s.label}>CANDIDATE OUTPUT</div>
          <textarea
            value={candidate}
            onChange={e => setCandidate(e.target.value)}
            placeholder="Paste LLM output here..."
            style={s.textarea({ flex: 1 })}
          />

          <button
            onClick={async () => {
              if (!candidate.trim()) return;
              setLoading(true);
              const output = await GenerateCandidate(candidate);
              setCandidate(output);
              setLoading(false);
            }}
            disabled={loading}
            style={{
              padding: "11px 0",
              background: "transparent",
              color: t.green,
              border: `1px solid ${t.green}`,
              borderRadius: 4,
              fontSize: 11,
              fontFamily: MONO,
              fontWeight: 700,
              letterSpacing: "0.2em",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {loading ? "[ GENERATING... ]" : "⚡ GENERATE WITH AGENT"}
          </button>

          <button
            onClick={evaluate}
            disabled={loading || !candidate.trim()}
            style={{
              padding: "11px 0",
              background: loading
                ? t.border
                : `linear-gradient(90deg, ${t.accent}22, ${t.accent}44)`,
              color: loading ? t.textMuted : t.accent,
              border: `1px solid ${loading ? t.border : t.accent}`,
              borderRadius: 4,
              fontSize: 11,
              fontFamily: MONO,
              fontWeight: 700,
              letterSpacing: "0.2em",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {loading ? "[ EVALUATING... ]" : "▶  RUN EVALUATE"}
          </button>

          {/* ── Result Badge ── */}
          {result && (
            <div style={{
              ...s.panel({
                padding: 14,
                border: `1px solid ${result.decision === "COMMIT" ? t.green : t.red}`,
                background: result.decision === "COMMIT"
                  ? "rgba(52,211,153,0.04)"
                  : "rgba(248,113,113,0.04)",
              }),
            }}>
              <div style={{
                fontSize: 20,
                fontWeight: 700,
                color: result.decision === "COMMIT" ? t.green : t.red,
                letterSpacing: "0.05em",
              }}>
                {result.decision === "COMMIT" ? "✓ COMMIT" : "✗ NO_COMMIT"}
              </div>
              <div style={{ color: t.textMuted, fontSize: 11, marginTop: 5, lineHeight: 1.5 }}>
                {result.reason}
              </div>
              <div style={{
                display: "flex", gap: 20, marginTop: 10,
                fontSize: 10, color: t.textMuted,
                borderTop: `1px solid ${t.border}`,
                paddingTop: 8,
              }}>
                <span>CONF <b style={{ color: t.text }}>{(result.confidence * 100).toFixed(0)}%</b></span>
                <span>TX <b style={{ color: t.text }}>{result.tx_hash}</b></span>
                <span>POL <b style={{ color: t.text }}>v{result.policy_version}</b></span>
              </div>
            </div>
          )}

          {/* ── Commit Rate Chart ── */}
          {chartData.length > 1 && (
            <div style={s.panel({ padding: 10 })}>
              <div style={{ ...s.label, marginBottom: 6 }}>COMMIT RATE HISTORY</div>
              <ResponsiveContainer width="100%" height={72}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={t.green} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={t.green} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone" dataKey="rate"
                    stroke={t.green} strokeWidth={1.5}
                    fill="url(#rateGrad)" dot={false}
                  />
                  <ReferenceLine
                    y={drift?.baseline}
                    stroke={t.accent} strokeDasharray="3 3" strokeWidth={1}
                  />
                  <XAxis dataKey="i" hide />
                  <YAxis domain={[0, 1]} hide />
                  <Tooltip
                    contentStyle={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 4, fontSize: 10 }}
                    formatter={v => [`${(v * 100).toFixed(0)}%`, "rate"]}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 9, color: t.textDim, marginTop: 4 }}>
                — baseline · — current rate
              </div>
            </div>
          )}
        </div>

        <div style={s.divider} />

        {/* ══ RIGHT: Audit + DriftMonitor ════════════════════════════════════ */}
        <div style={{ width: 360, display: "flex", flexDirection: "column" }}>

          {/* Tab bar */}
          <div style={{
            display: "flex",
            borderBottom: `1px solid ${t.border}`,
            background: t.panel,
          }}>
            {["audit", "drift"].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: activeTab === tab ? t.surface : "transparent",
                  color: activeTab === tab ? t.accent : t.textMuted,
                  border: "none",
                  borderBottom: activeTab === tab ? `2px solid ${t.accent}` : "2px solid transparent",
                  fontFamily: MONO,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {tab === "audit" ? "AUDIT TRAIL" : "DRIFTMONITOR"}
              </button>
            ))}
          </div>

          {/* ── AUDIT TAB ── */}
          {activeTab === "audit" && (
            <>
              {/* Export bar */}
              <div style={{
                padding: "8px 12px",
                display: "flex",
                gap: 6,
                alignItems: "center",
                borderBottom: `1px solid ${t.border}`,
                background: t.panel,
              }}>
                <button style={s.btn(false, t.accent, { fontSize: 9 })} onClick={exportCSV}>
                  ↓ CSV
                </button>
                <button style={s.btn(false, t.accent, { fontSize: 9 })} onClick={exportJSON}>
                  ↓ JSON
                </button>
                <div style={{ flex: 1, fontSize: 9, color: t.green, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {exportMsg}
                </div>
                <button
                  onClick={clear}
                  style={s.btn(false, t.red, { fontSize: 9 })}
                >
                  CLEAR
                </button>
              </div>

              {/* Entries */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {audit.map((entry, i) => (
                  <div key={i} style={{
                    padding: "9px 12px",
                    borderBottom: `1px solid ${t.surface}`,
                    borderLeft: `3px solid ${entry.decision === "COMMIT" ? t.green : t.red}`,
                    transition: "background 0.15s",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{
                        color: entry.decision === "COMMIT" ? t.green : t.red,
                        fontWeight: 700, fontSize: 10,
                      }}>
                        {entry.decision}
                      </span>
                      <span style={{ color: t.textDim, fontSize: 9 }}>
                        {entry.timestamp.split("T")[1]?.slice(0, 8)}
                      </span>
                    </div>
                    <div style={{ color: t.textMuted, fontSize: 10, marginTop: 3, lineHeight: 1.4 }}>
                      {entry.reason}
                    </div>
                    <div style={{ color: t.textDim, fontSize: 9, marginTop: 3 }}>
                      {entry.tx_hash} · conf:{(entry.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                ))}
                {!audit.length && (
                  <div style={{
                    color: t.textDim, fontSize: 11,
                    textAlign: "center", marginTop: 50,
                    letterSpacing: "0.1em",
                  }}>
                    NO EVALUATIONS YET
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── DRIFT TAB ── */}
          {activeTab === "drift" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {drift ? (
                <>
                  {/* Threat Level Badge */}
                  <div style={{
                    padding: 14,
                    borderRadius: 4,
                    border: `1px solid ${threatColor(drift.threat_level, t)}`,
                    background: threatBg(drift.threat_level),
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: threatColor(drift.threat_level, t), letterSpacing: "0.1em" }}>
                      {drift.threat_level}
                    </div>
                    <div style={{ fontSize: 9, color: t.textMuted, marginTop: 4, letterSpacing: "0.12em" }}>
                      THREAT LEVEL
                    </div>
                  </div>

                  {/* Stats Grid */}
                  {[
                    ["Z-SCORE",       drift.z_score?.toFixed(2) ?? "—", Math.abs(drift.z_score) > 1.96 ? t.red : t.green],
                    ["BASELINE",      (drift.baseline * 100).toFixed(1) + "%", t.text],
                    ["CURRENT RATE",  (drift.current_rate * 100).toFixed(1) + "%", t.text],
                    ["WINDOW SIZE",   drift.window_size, t.text],
                    ["DRIFT",         drift.drift_detected ? "DETECTED" : "NONE", drift.drift_detected ? t.orange : t.green],
                  ].map(([label, val, color]) => (
                    <div key={label} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 12px",
                      ...s.panel(),
                    }}>
                      <span style={{ color: t.textMuted, fontSize: 10, letterSpacing: "0.1em" }}>{label}</span>
                      <span style={{ color, fontWeight: 700, fontSize: 12 }}>{val}</span>
                    </div>
                  ))}

                  {/* Formula reminder */}
                  <div style={s.panel({ padding: 10 })}>
                    <div style={{ ...s.label, marginBottom: 6 }}>Z-TEST FORMULA</div>
                    <div style={{ color: t.textMuted, fontSize: 10, lineHeight: 1.7, fontStyle: "italic" }}>
                      Z_t = (p̂_t − p₀) / √(p₀·(1−p₀)/W)<br />
                      drift if |Z_t| &gt; 1.96
                    </div>
                  </div>

                  {/* 4-mode legend */}
                  <div style={s.panel({ padding: 10 })}>
                    <div style={{ ...s.label, marginBottom: 8 }}>ESCALATION MODES</div>
                    {[
                      ["NORMAL",     "|Z| ≤ 1.96",  t.green],
                      ["WARNING",    "|Z| > 1.96",  t.yellow],
                      ["ESCALATION", "|Z| > 2.5",   t.orange],
                      ["BLOCK",      "|Z| > 3.5",   t.red],
                    ].map(([mode, cond, color]) => (
                      <div key={mode} style={{
                        display: "flex", justifyContent: "space-between",
                        padding: "4px 0",
                        borderBottom: `1px solid ${t.border}`,
                      }}>
                        <span style={{ color, fontWeight: 700, fontSize: 10 }}>{mode}</span>
                        <span style={{ color: t.textDim, fontSize: 10 }}>{cond}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ color: t.textDim, fontSize: 11, textAlign: "center", marginTop: 50, letterSpacing: "0.1em" }}>
                  RUN EVALUATIONS<br />TO SEE DRIFT STATS
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
