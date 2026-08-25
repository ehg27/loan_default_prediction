import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const TOOLTIP_WIDTH = 288;

function Row({ c, maxAbs }) {
  const rowRef = useRef(null);
  const [hoverPos, setHoverPos] = useState(null);
  const pct = (Math.abs(c.shap) / maxAbs) * 50;
  const positive = c.shap >= 0;

  function handleEnter() {
    // Ancestors use backdrop-filter (the .card glass effect), which — like `filter` —
    // creates a new containing block for `position: fixed` descendants per the CSS spec.
    // Portaling to document.body keeps this tooltip anchored to the real viewport instead
    // of the nearest filtered Card, so the viewport-clamped left/top below stays accurate.
    const rect = rowRef.current.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(Math.max(rect.left + 190, margin), window.innerWidth - TOOLTIP_WIDTH - margin);
    setHoverPos({ left, top: rect.bottom + 4 });
  }

  return (
    <div ref={rowRef} className="relative flex items-center gap-2 py-[3px]" onMouseEnter={handleEnter} onMouseLeave={() => setHoverPos(null)}>
      <div className="w-[190px] text-[12px] text-right truncate shrink-0" style={{ color: "var(--text-secondary)" }}>
        {c.label}
      </div>
      <div className="flex-1 h-6 relative flex items-center rounded" style={{ background: "var(--bg-elevated-2)" }}>
        <div className="absolute left-1/2 top-0 bottom-0 w-px" style={{ background: "var(--border)" }} />
        <div
          className="absolute h-full rounded transition-all"
          style={{
            width: `${pct}%`,
            left: positive ? "50%" : `${50 - pct}%`,
            background: positive ? "var(--risk-high)" : "var(--risk-low)",
            opacity: 0.85,
          }}
        />
      </div>
      <div className="w-16 text-[11.5px] font-mono shrink-0" style={{ color: positive ? "var(--risk-high)" : "var(--risk-low)" }}>
        {positive ? "+" : ""}{c.shap.toFixed(4)}
      </div>

      {/* hover card — portaled to <body> + clamped to viewport so it never runs off-screen
          or gets mispositioned by an ancestor Card's backdrop-filter containing block */}
      {hoverPos && createPortal(
        <div
          className="fixed z-50 rounded-xl text-left pointer-events-none p-3"
          style={{ left: hoverPos.left, top: hoverPos.top, width: TOOLTIP_WIDTH, background: "var(--bg-elevated-solid)", border: "1px solid var(--border)", boxShadow: "0 12px 30px -8px rgba(0,0,0,0.6)" }}
        >
          <div className="text-[12.5px] font-semibold mb-1" style={{ color: "var(--text)" }}>{c.label}</div>
          {c.description && (
            <div className="text-[11px] leading-relaxed mb-2" style={{ color: "var(--text-secondary)" }}>{c.description}</div>
          )}
          <div className="flex items-center justify-between text-[11.5px] font-mono">
            <span style={{ color: "var(--text-tertiary)" }}>Customer's value</span>
            <span style={{ color: "var(--accent)" }}>{c.display_value ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between text-[11.5px] font-mono mt-1">
            <span style={{ color: "var(--text-tertiary)" }}>SHAP contribution</span>
            <span style={{ color: positive ? "var(--risk-high)" : "var(--risk-low)" }}>
              {positive ? "+" : ""}{c.shap.toFixed(4)}
            </span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export function ShapWaterfall({ baseValue, contributions, initialCount = 20, breakdown }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? contributions : contributions.slice(0, initialCount);
  const maxAbs = useMemo(() => Math.max(...contributions.map((c) => Math.abs(c.shap)), 0.001), [contributions]);
  const otherCount = contributions.length - shown.length;
  const otherSum = useMemo(
    () => contributions.slice(shown.length).reduce((s, c) => s + c.shap, 0),
    [contributions, shown.length]
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
        <span>Base rate (avg. borrower, log-odds): <span className="font-mono" style={{ color: "var(--text-secondary)" }}>{baseValue.toFixed(4)}</span></span>
        <span>{contributions.length} features trained</span>
      </div>

      <div className="flex flex-col gap-0.5">
        {shown.map((c) => (
          <Row key={c.feature} c={c} maxAbs={maxAbs} />
        ))}
      </div>

      {otherCount > 0 && (
        <div className="flex items-center gap-2 py-[3px] mt-1 text-[11.5px]" style={{ color: "var(--text-tertiary)" }}>
          <div className="w-[190px] text-right shrink-0">+ {otherCount} more features (combined)</div>
          <div className="flex-1" />
          <div className="w-16 font-mono shrink-0">{otherSum >= 0 ? "+" : ""}{otherSum.toFixed(4)}</div>
        </div>
      )}

      {contributions.length > initialCount && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[12px] font-medium px-2.5 py-1 rounded-md"
          style={{ color: "var(--accent)", background: "var(--accent-soft)" }}
        >
          {expanded ? `Show top ${initialCount} only` : `Show all ${contributions.length} features`}
        </button>
      )}

      <div className="flex items-center gap-4 mt-3 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--risk-high)" }} /> pushes toward default</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--risk-low)" }} /> pushes toward repayment</span>
      </div>

      {breakdown && (
        <div className="mt-4 pt-3 text-[11.5px] font-mono flex flex-col gap-1" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex justify-between"><span style={{ color: "var(--text-tertiary)" }}>Base value</span><span>{breakdown.base_value_logodds.toFixed(4)}</span></div>
          <div className="flex justify-between"><span style={{ color: "var(--text-tertiary)" }}>+ Σ all {contributions.length} SHAP contributions</span><span>{breakdown.sum_shap_logodds >= 0 ? "+" : ""}{breakdown.sum_shap_logodds.toFixed(4)}</span></div>
          <div className="flex justify-between font-semibold" style={{ color: "var(--text)" }}><span>= Raw output (log-odds)</span><span>{breakdown.raw_logit.toFixed(4)}</span></div>
          <div className="flex justify-between font-semibold" style={{ color: "var(--accent)" }}><span>→ Output</span><span>{(breakdown.calibrated_pd * 100).toFixed(2)}%</span></div>
        </div>
      )}
    </div>
  );
}
