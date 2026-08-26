import { useMemo, useState } from "react";
import {
  ResponsiveContainer, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ComposedChart, Legend,
} from "recharts";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { Loading, ErrorBox } from "../components/ui/Loading";
import { Card, CardHeader } from "../components/ui/Card";
import { StatTile } from "../components/ui/StatTile";
import { fmtPct, fmtUSD, fmtNum } from "../lib/format";

const KEY_POINT_ORDER = ["baseline_approve_all", "financial_optimal", "f1_optimal", "chosen"];
const KEY_POINT_COLOR = {
  baseline_approve_all: "var(--text-tertiary)",
  f1_optimal: "var(--accent-2)",
  chosen: "var(--accent)",
  financial_optimal: "var(--risk-high)",
};

function CostDelta({ savings }) {
  const saves = savings >= 0;
  return (
    <span style={{ color: saves ? "var(--risk-low)" : "var(--risk-high)" }}>
      {saves ? "saves" : "costs"} {fmtUSD(Math.abs(savings))} {saves ? "versus" : "more than"} approving everyone
    </span>
  );
}

function NarrativeSection({ keyPoints, lgdPct }) {
  const chosen = keyPoints.chosen;
  const f1 = keyPoints.f1_optimal;
  const fin = keyPoints.financial_optimal;
  const chosenIsCostOptimal = Math.abs(chosen.threshold - fin.threshold) < 0.0005;
  const finSavingsPct = (fin.savings_vs_approve_all / (fin.total_cost - fin.savings_vs_approve_all)) * 100;
  const finNegligible = Math.abs(finSavingsPct) < 1;

  return (
    <Card className="mb-6">
      <CardHeader eyebrow="Methodology" title={`Comparing operating points at LGD = ${lgdPct}%`} />
      <p className="text-[13px] leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
        Every threshold trades off two goals: catching defaults (recall) and minimizing total financial cost — they
        are not always the same objective. The <b style={{ color: KEY_POINT_COLOR.financial_optimal }}>cost-minimizing</b> threshold
        ({fin.threshold.toFixed(4)}) <CostDelta savings={fin.savings_vs_approve_all} /> ({Math.abs(finSavingsPct).toFixed(1)}% of the no-model
        cost), catching {fmtPct(fin.recall, 1)} of defaults{finNegligible ? " — at this LGD that's barely distinguishable from doing nothing" : ""}.
        The <b style={{ color: KEY_POINT_COLOR.f1_optimal }}>F1-optimal</b> threshold
        ({f1.threshold.toFixed(4)}) catches far more defaults ({fmtPct(f1.recall, 1)} recall) but <CostDelta savings={f1.savings_vs_approve_all} />.
      </p>
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {chosenIsCostOptimal ? (
          <>At this LGD, the <b style={{ color: KEY_POINT_COLOR.chosen }}>chosen threshold and the cost-minimizer are the same point</b> ({chosen.threshold.toFixed(4)}) —
          catching {fmtPct(chosen.recall, 1)} of defaults at {fmtPct(chosen.precision, 1)} precision is not just a compromise, it's the
          financially optimal outcome too.</>
        ) : (
          <>The <b style={{ color: KEY_POINT_COLOR.chosen }}>chosen threshold</b> ({chosen.threshold.toFixed(4)}) is a deliberate
          balance between those two extremes, not either one on its own: it gives up
          ${((chosen.total_cost - fin.total_cost) / 1e6).toFixed(2)}M versus the pure cost-minimizer, in exchange for
          catching {(chosen.recall / fin.recall).toFixed(1)}× as many defaults ({fmtPct(chosen.recall, 1)} vs. {fmtPct(fin.recall, 1)} recall).
          It still <CostDelta savings={chosen.savings_vs_approve_all} />.</>
        )} Use the chart and slider below to explore the full trade-off curve (including F1) and see how this balance compares to the extremes.
      </p>
    </Card>
  );
}

function KeyPointsTable({ keyPoints, lgdPct }) {
  return (
    <Card className="mb-6 overflow-x-auto">
      <CardHeader eyebrow="Comparison" title="Three operating points on the same model" subtitle={`All computed on the held-out test set, LGD = ${lgdPct}%`} />
      <table className="w-full text-[13px] border-collapse min-w-[720px]">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["Operating point", "Threshold", "Accuracy", "Precision", "Recall", "F1", "Total cost", "vs. no model"].map((h) => (
              <th key={h} className="text-left py-2.5 px-3 font-medium text-[11px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {KEY_POINT_ORDER.map((key) => {
            const p = keyPoints[key];
            const savings = p.savings_vs_approve_all;
            return (
              <tr key={key} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td className="py-2.5 px-3 font-medium flex items-center gap-2" style={{ color: "var(--text)" }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: KEY_POINT_COLOR[key] }} />
                  {p.label}
                </td>
                <td className="py-2.5 px-3 font-mono" style={{ color: "var(--text-secondary)" }}>{p.threshold != null ? p.threshold.toFixed(4) : "—"}</td>
                <td className="py-2.5 px-3 font-mono" style={{ color: "var(--text-secondary)" }}>{fmtPct(p.accuracy)}</td>
                <td className="py-2.5 px-3 font-mono" style={{ color: "var(--text-secondary)" }}>{p.precision != null ? fmtPct(p.precision) : "—"}</td>
                <td className="py-2.5 px-3 font-mono" style={{ color: "var(--text-secondary)" }}>{fmtPct(p.recall)}</td>
                <td className="py-2.5 px-3 font-mono" style={{ color: "var(--text-secondary)" }}>{p.f1.toFixed(4)}</td>
                <td className="py-2.5 px-3 font-mono font-semibold" style={{ color: "var(--text)" }}>{fmtUSD(p.total_cost)}</td>
                <td className="py-2.5 px-3 font-mono font-semibold" style={{ color: savings > 0 ? "var(--risk-low)" : savings < 0 ? "var(--risk-high)" : "var(--text-tertiary)" }}>
                  {savings > 0 ? "+" : ""}{fmtUSD(savings)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function ModelCostComparison({ keyPoints, lgdPct }) {
  const xgb = keyPoints.chosen;
  const lr = keyPoints.chosen_lr;
  if (!lr) return null;
  const diff = lr.total_cost - xgb.total_cost;
  const lrCheaper = diff < 0;

  return (
    <Card className="mb-6">
      <CardHeader
        eyebrow="Model comparison"
        title="Does Logistic Regression cost less than XGBoost?"
        subtitle={`Both judged at the same shared threshold (${xgb.threshold.toFixed(4)}) and LGD = ${lgdPct}%`}
      />
      <div className="grid sm:grid-cols-2 gap-4 mb-3">
        <div className="rounded-xl p-3.5" style={{ background: "var(--bg-elevated-2)", border: `1px solid ${lrCheaper ? "var(--border)" : "var(--accent-border)"}` }}>
          <div className="text-[11px] uppercase tracking-wide flex items-center gap-1.5" style={{ color: "var(--text-tertiary)" }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
            XGBoost (Tuned)
          </div>
          <div className="text-[22px] font-mono font-bold mt-1" style={{ color: "var(--text)" }}>{fmtUSD(xgb.total_cost)}</div>
        </div>
        <div className="rounded-xl p-3.5" style={{ background: "var(--bg-elevated-2)", border: `1px solid ${lrCheaper ? "var(--accent-2-border)" : "var(--border)"}` }}>
          <div className="text-[11px] uppercase tracking-wide flex items-center gap-1.5" style={{ color: "var(--text-tertiary)" }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--accent-2)" }} />
            Logistic Regression (Tuned)
          </div>
          <div className="text-[22px] font-mono font-bold mt-1" style={{ color: "var(--text)" }}>{fmtUSD(lr.total_cost)}</div>
        </div>
      </div>
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {lrCheaper ? (
          <>No — at this reference point, <b style={{ color: "var(--risk-low)" }}>Logistic Regression is actually {fmtUSD(Math.abs(diff))} cheaper</b> than
          XGBoost ({fmtPct(lr.recall, 1)} recall vs. XGBoost's {fmtPct(xgb.recall, 1)}).</>
        ) : (
          <>No — <b style={{ color: "var(--risk-high)" }}>Logistic Regression costs {fmtUSD(Math.abs(diff))} more</b> than XGBoost at the same
          threshold, mainly from catching fewer defaults ({fmtPct(lr.recall, 1)} recall vs. XGBoost's {fmtPct(xgb.recall, 1)}). This is the
          accuracy XGBoost trades a harder-to-explain model for — see Model Comparison for the full ROC-AUC gap.</>
        )}
      </p>
    </Card>
  );
}

export function ThresholdOptimizer({ onNavigate }) {
  const { data, error, loading } = useApi(() => api.thresholdAnalysis(), []);
  const [idx, setIdx] = useState(null);

  const rows = data?.curve ?? [];
  const optimalIdx = useMemo(() => {
    if (!rows.length) return 0;
    let best = 0;
    rows.forEach((r, i) => { if (r.total_cost < rows[best].total_cost) best = i; });
    return best;
  }, [rows]);
  const f1OptimalIdx = useMemo(() => {
    if (!rows.length) return 0;
    let best = 0;
    rows.forEach((r, i) => { if (r.f1 > rows[best].f1) best = i; });
    return best;
  }, [rows]);
  // The graph opens on the threshold this project actually uses, not the pure cost-minimizer —
  // those are two different points now, and defaulting to the cost-minimizer made the "current
  // position" line invisible (it landed exactly on top of the cost-optimal marker).
  const chosenIdx = useMemo(() => {
    if (!rows.length || !data) return 0;
    const target = data.key_points.chosen.threshold;
    let best = 0, bestDist = Infinity;
    rows.forEach((r, i) => { const dist = Math.abs(r.threshold - target); if (dist < bestDist) { bestDist = dist; best = i; } });
    return best;
  }, [rows, data]);

  const activeIdx = idx ?? chosenIdx;
  const active = rows[activeIdx];

  if (loading) return <Loading label="Computing financial cost curves across LGD levels…" />;
  if (error) return <ErrorBox message={error} />;

  return (
    <div>
      <header className="mb-6">
        <div className="text-[11px] tracking-[0.16em] uppercase font-medium mb-2" style={{ color: "var(--accent)" }}>Decisioning</div>
        <h1 className="text-[26px] font-semibold" style={{ color: "var(--text)" }}>Financial threshold optimizer</h1>
        <p className="text-[13.5px] mt-1 max-w-[720px]" style={{ color: "var(--text-secondary)" }}>
          Every threshold trades off two costs: approving a borrower who defaults (<b style={{ color: "var(--risk-high)" }}>false negative</b> —
          lose loan-amount × LGD) vs. rejecting one who would have repaid (<b style={{ color: "var(--risk-mid)" }}>false positive</b> — forgo
          contractual interest).
        </p>
        <p className="text-[12px] mt-2 max-w-[720px]" style={{ color: "var(--text-tertiary)" }}>
          This project uses <b style={{ color: "var(--text-secondary)" }}>LGD = {(data.key_points_lgd * 100).toFixed(0)}%</b> —
          the share of a defaulted loan's value that's never recovered. Instead of guessing a typical industry
          figure, this was calculated from real repayment records on {fmtNum(269320)} loans that actually defaulted.{" "}
          {onNavigate && (
            <button onClick={() => onNavigate("lgd")} className="font-medium" style={{ color: "var(--accent)" }}>
              See the full breakdown →
            </button>
          )}
        </p>
      </header>

      <NarrativeSection keyPoints={data.key_points} lgdPct={(data.key_points_lgd * 100).toFixed(0)} />
      <KeyPointsTable keyPoints={data.key_points} lgdPct={(data.key_points_lgd * 100).toFixed(0)} />
      <ModelCostComparison keyPoints={data.key_points} lgdPct={(data.key_points_lgd * 100).toFixed(0)} />

      <div className="grid lg:grid-cols-[1fr_300px] gap-4 mb-6">
        <Card>
          <CardHeader
            title="Cost vs. calibrated PD threshold"
            subtitle={`LGD = ${(data.key_points_lgd * 100).toFixed(0)}% (this project's one reference assumption) · drag the slider below or click the chart`}
          />
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={rows} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}
              onClick={(s) => { if (s && s.activeTooltipIndex !== undefined) setIdx(s.activeTooltipIndex); }}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="threshold" type="number" domain={["dataMin", "dataMax"]}
                tickFormatter={(v) => v.toFixed(2)} tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} stroke="var(--border)"
                label={{ value: "Calibrated PD threshold", position: "insideBottom", offset: -3, fill: "var(--text-tertiary)", fontSize: 11 }}
              />
              <YAxis
                yAxisId="cost"
                tickFormatter={(v) => fmtUSD(v)} tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} stroke="var(--border)" width={70}
              />
              <YAxis
                yAxisId="f1" orientation="right" domain={[0, 1]}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fill: "var(--accent-2)", fontSize: 11 }} stroke="var(--border)" width={40}
              />
              <Tooltip
                contentStyle={{ background: "var(--bg-elevated-solid)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                formatter={(v, name) => (name === "F1 score" ? [fmtPct(v), name] : [fmtUSD(v, false), name])}
                labelFormatter={(v) => `Threshold ${Number(v).toFixed(4)}`}
                offset={28}
                isAnimationActive={false}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "var(--text-tertiary)", paddingTop: 18 }} />
              <Line yAxisId="cost" type="monotone" dataKey="fp_cost" name="FP cost (lost interest)" stroke="var(--risk-mid)" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              <Line yAxisId="cost" type="monotone" dataKey="fn_cost" name="FN cost (default loss)" stroke="var(--risk-high)" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              <Line yAxisId="cost" type="monotone" dataKey="total_cost" name="Total cost" stroke="var(--risk-low)" strokeWidth={2.6} dot={false} isAnimationActive={false} />
              <Line yAxisId="f1" type="monotone" dataKey="f1" name="F1 score" stroke="var(--accent-2)" strokeWidth={1.6} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              {/* yAxisId is required on every ReferenceLine here — recharts 3.x defaults it to the
                  numeric 0, which doesn't match either of our string-named axes ("cost"/"f1"), so
                  without it these silently fail to resolve an axis and render nothing at all (not
                  just "hidden behind another line" — genuinely absent from the DOM). Any valid
                  yAxisId works for a vertical x= line; "cost" is used for all three for consistency.
                  Fixed markers first, the draggable "current position" line drawn last (on top of
                  everything else) so it's always visible even when dragged to exactly overlap one
                  of the fixed markers below. */}
              {rows[optimalIdx] && (() => {
                const coincide = Math.abs(rows[optimalIdx].threshold - data.key_points.chosen.threshold) < 0.0005;
                return (
                  <ReferenceLine yAxisId="cost" x={rows[optimalIdx].threshold} stroke="var(--risk-low)" strokeDasharray="2 2"
                    label={{ value: coincide ? "chosen = cost-optimal" : "cost-optimal", position: "top", offset: 14, fill: "var(--risk-low)", fontSize: 10 }} />
                );
              })()}
              {Math.abs(rows[optimalIdx]?.threshold - data.key_points.chosen.threshold) >= 0.0005 && (
                <ReferenceLine yAxisId="cost" x={data.key_points.chosen.threshold} stroke="var(--accent)" strokeDasharray="2 2"
                  label={{ value: "chosen", position: "top", offset: 30, fill: "var(--accent)", fontSize: 10 }} />
              )}
              {rows[f1OptimalIdx]
                && Math.abs(rows[f1OptimalIdx].threshold - data.key_points.chosen.threshold) >= 0.0005
                && Math.abs(rows[f1OptimalIdx].threshold - rows[optimalIdx]?.threshold) >= 0.0005 && (
                <ReferenceLine yAxisId="cost" x={rows[f1OptimalIdx].threshold} stroke="var(--accent-2)" strokeDasharray="2 2"
                  label={{ value: "F1-optimal", position: "top", offset: 46, fill: "var(--accent-2)", fontSize: 10 }} />
              )}
              {active && (
                <ReferenceLine yAxisId="cost" x={active.threshold} stroke="var(--text)" strokeWidth={1.5} strokeDasharray="3 3"
                  label={{ value: "current", position: "insideTopLeft", offset: 8, fill: "var(--text)", fontSize: 10 }} />
              )}
            </ComposedChart>
          </ResponsiveContainer>

          {/* Legend for the three vertical reference lines — recharts' <Legend/> only picks up
              data series (the Line components above), not ReferenceLine markers, so those need
              their own explanation here rather than relying on the small inline chart labels. */}
          <div className="flex items-center gap-4 flex-wrap text-[11px] mt-5" style={{ color: "var(--text-tertiary)", paddingLeft: 70 }}>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0 inline-block" style={{ borderTop: "2px dashed var(--risk-low)" }} />
              Cost-optimal
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0 inline-block" style={{ borderTop: "2px dashed var(--accent)" }} />
              Chosen
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0 inline-block" style={{ borderTop: "2px dashed var(--accent-2)" }} />
              F1-optimal
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0 inline-block" style={{ borderTop: "2px dashed var(--text)" }} />
              Current position
            </span>
          </div>

          {/* Padded to match the chart's plot area, not the card's full width — the chart reserves
              70px on the left (cost axis) and 55px on the right (margin + F1 axis) for labels, so a
              full-width slider would visibly overshoot the chart's actual x-axis on both sides. */}
          <div className="mt-3" style={{ paddingLeft: 70, paddingRight: 55 }}>
            <input
              type="range" min={0} max={rows.length - 1} step={1}
              value={activeIdx}
              onChange={(e) => setIdx(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[11px] mt-1 font-mono" style={{ color: "var(--text-tertiary)" }}>
              <span>{rows[0]?.threshold.toFixed(4)}</span>
              <span style={{ color: "var(--accent)" }}>threshold = {active?.threshold.toFixed(4)}</span>
              <span>{rows[rows.length - 1]?.threshold.toFixed(4)}</span>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            {rows[chosenIdx] && (
              <button
                onClick={() => setIdx(null)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-elevated-2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-elevated)"; }}
                className="flex-1 text-[12.5px] font-medium px-3 py-2 rounded-lg transition-colors"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--accent)" }}
              >
                ↺ Jump to chosen threshold ({rows[chosenIdx].threshold.toFixed(4)})
              </button>
            )}
            {rows[optimalIdx] && (
              <button
                onClick={() => setIdx(optimalIdx)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-elevated-2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-elevated)"; }}
                className="flex-1 text-[12.5px] font-medium px-3 py-2 rounded-lg transition-colors"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--risk-low)" }}
              >
                ↺ Jump to cost-optimal threshold ({rows[optimalIdx].threshold.toFixed(4)})
              </button>
            )}
            {rows[f1OptimalIdx] && (
              <button
                onClick={() => setIdx(f1OptimalIdx)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-elevated-2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-elevated)"; }}
                className="flex-1 text-[12.5px] font-medium px-3 py-2 rounded-lg transition-colors"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--accent-2)" }}
              >
                ↺ Jump to F1-optimal threshold ({rows[f1OptimalIdx].threshold.toFixed(4)})
              </button>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-3 h-full">
          <Card>
            <CardHeader eyebrow="At this threshold" title="Portfolio cost" />
            <div className="flex flex-col gap-2.5 mt-1">
              <Row label="FP cost" value={fmtUSD(active?.fp_cost)} color="var(--risk-mid)" />
              <Row label="FN cost" value={fmtUSD(active?.fn_cost)} color="var(--risk-high)" />
              <Row label="Total cost" value={fmtUSD(active?.total_cost)} color="var(--accent)" bold />
              <div style={{ borderTop: "1px solid var(--border)" }} className="pt-2.5" />
              <Row
                label="Savings vs. no model"
                value={`${active?.savings_vs_approve_all > 0 ? "+" : ""}${fmtUSD(active?.savings_vs_approve_all)}`}
                color={active?.savings_vs_approve_all > 0 ? "var(--risk-low)" : "var(--risk-high)"}
              />
              <Row label="False positives" value={fmtNum(active?.fp_count)} />
              <Row label="False negatives" value={fmtNum(active?.fn_count)} />
            </div>
          </Card>
          <Card className="flex-1 flex flex-col">
            <CardHeader eyebrow="At this threshold" title="Classification metrics" />
            <div className="grid grid-cols-2 gap-2.5 mt-1 flex-1 content-center">
              <StatTile label="Accuracy" value={fmtPct(active?.accuracy)} />
              <StatTile label="Precision" value={fmtPct(active?.precision)} />
              <StatTile label="Recall" value={fmtPct(active?.recall)} />
              <StatTile label="F1" value={fmtPct(active?.f1)} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color, bold }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="font-mono text-[13.5px]" style={{ color: color || "var(--text)", fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}
