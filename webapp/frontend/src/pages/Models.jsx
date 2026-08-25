import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { Loading, ErrorBox } from "../components/ui/Loading";
import { Card, CardHeader } from "../components/ui/Card";
import { Modal, ZoomButton } from "../components/ui/Modal";
import { fmtPct, modelColor } from "../lib/format";

function CurveChart({ title, subtitle, curves, activeModels, xLabel, yLabel, diagonal, zoomed, onZoom }) {
  const seriesByModel = useMemo(() => {
    if (!curves) return {};
    const out = {};
    Object.entries(curves).forEach(([name, c]) => {
      out[name] = c.x.map((x, i) => ({ x, y: c.y[i] }));
    });
    return out;
  }, [curves]);

  return (
    <Card>
      <CardHeader eyebrow="Test set" title={title} subtitle={subtitle} right={onZoom && <ZoomButton onClick={onZoom} />} />
      <ResponsiveContainer width="100%" height={zoomed ? 560 : 340}>
        <LineChart margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number" dataKey="x" domain={[0, 1]}
            tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} tickFormatter={(v) => v.toFixed(1)}
            label={{ value: xLabel, position: "insideBottom", offset: -2, fill: "var(--text-tertiary)", fontSize: 11 }}
            stroke="var(--border)"
          />
          <YAxis
            type="number" domain={[0, 1]} tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} tickFormatter={(v) => v.toFixed(1)}
            label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--text-tertiary)", fontSize: 11 }}
            stroke="var(--border)"
          />
          <Tooltip
            contentStyle={{ background: "var(--bg-elevated-2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
            labelFormatter={() => ""}
            formatter={(value, name) => [Number(value).toFixed(4), name]}
            isAnimationActive={false}
          />
          {diagonal && (
            <ReferenceLine
              segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]}
              stroke="var(--text-tertiary)" strokeDasharray="4 4" strokeWidth={1} ifOverflow="extendDomain"
            />
          )}
          {activeModels.map((name) => (
            <Line
              key={name} type="monotone" data={seriesByModel[name] || []} dataKey="y" name={name}
              stroke={modelColor(name)} strokeWidth={name.includes("Tuned") ? 2.2 : 1.4}
              dot={false} isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function Models() {
  const { data: comparison, loading: l1, error: e1 } = useApi(() => api.modelComparison(), []);
  const { data: roc, loading: l2 } = useApi(() => api.rocCurves(), []);
  const { data: pr, loading: l3 } = useApi(() => api.prCurves(), []);
  const [activeModels, setActiveModels] = useState(null);
  const [zoomed, setZoomed] = useState(null); // "roc" | "pr" | null

  const models = comparison?.models ?? [];
  const allNames = models.map((m) => m.model);
  const active = activeModels ?? allNames;

  function toggle(name) {
    setActiveModels((prev) => {
      const base = prev ?? allNames;
      return base.includes(name) ? base.filter((n) => n !== name) : [...base, name];
    });
  }

  if (l1) return <Loading label="Scoring all 8 models on the held-out test set…" />;
  if (e1) return <ErrorBox message={e1} />;

  return (
    <div>
      <header className="mb-6">
        <div className="text-[11px] tracking-[0.16em] uppercase font-medium mb-2" style={{ color: "var(--accent)" }}>Benchmark</div>
        <h1 className="text-[26px] font-semibold" style={{ color: "var(--text)" }}>Model comparison</h1>
        <p className="text-[13.5px] mt-1" style={{ color: "var(--text-secondary)" }}>
          Baseline vs. hyperparameter-tuned variants of 4 algorithms, evaluated on a {comparison.n_test.toLocaleString()}-row
          held-out test set (default base rate {fmtPct(comparison.baseline_rate)}).
        </p>
      </header>

      <Card className="mb-6 overflow-x-auto">
        <table className="w-full text-[13px] border-collapse min-w-[760px]">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Model", "Accuracy", "Precision", "Recall", "F1", "ROC-AUC", "AP"].map((h) => (
                <th key={h} className="text-left py-2.5 px-3 font-medium text-[11px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((m, i) => (
              <tr
                key={m.model}
                className="cursor-pointer transition-colors"
                style={{ borderBottom: "1px solid var(--border-subtle)", opacity: active.includes(m.model) ? 1 : 0.35 }}
                onClick={() => toggle(m.model)}
              >
                <td className="py-2.5 px-3 font-medium flex items-center gap-2" style={{ color: "var(--text)" }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: modelColor(m.model) }} />
                  {m.model}
                  {i === 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>BEST</span>
                  )}
                  {m.model === "Logistic Regression (Tuned)" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono" style={{ background: "var(--accent-2-soft)", color: "var(--accent-2)" }}>BASELINE</span>
                  )}
                </td>
                <td className="py-2.5 px-3 font-mono" style={{ color: "var(--text-secondary)" }}>{fmtPct(m.accuracy)}</td>
                <td className="py-2.5 px-3 font-mono" style={{ color: "var(--text-secondary)" }}>{fmtPct(m.precision)}</td>
                <td className="py-2.5 px-3 font-mono" style={{ color: "var(--text-secondary)" }}>{fmtPct(m.recall)}</td>
                <td className="py-2.5 px-3 font-mono" style={{ color: "var(--text-secondary)" }}>{fmtPct(m.f1)}</td>
                <td className="py-2.5 px-3 font-mono font-semibold" style={{ color: "var(--text)" }}>{m.roc_auc.toFixed(4)}</td>
                <td className="py-2.5 px-3 font-mono" style={{ color: "var(--text-secondary)" }}>{m.ap.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-[11.5px] mt-3 px-1" style={{ color: "var(--text-tertiary)" }}>
          Click a row to toggle it on the curves below.
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {!l2 && roc && (
          <CurveChart
            title="ROC curves" subtitle="True positive rate vs. false positive rate"
            curves={roc} activeModels={active} xLabel="False Positive Rate" yLabel="True Positive Rate" diagonal
            onZoom={() => setZoomed("roc")}
          />
        )}
        {!l3 && pr && (
          <CurveChart
            title="Precision–Recall curves" subtitle={`Baseline (default rate) = ${fmtPct(comparison.baseline_rate)}`}
            curves={pr} activeModels={active} xLabel="Recall" yLabel="Precision"
            onZoom={() => setZoomed("pr")}
          />
        )}
      </div>

      <Modal open={!!zoomed} onClose={() => setZoomed(null)} title={zoomed === "roc" ? "ROC curves" : "Precision–Recall curves"} width={1000}>
        {zoomed === "roc" && roc && (
          <CurveChart
            title="ROC curves" subtitle="True positive rate vs. false positive rate"
            curves={roc} activeModels={active} xLabel="False Positive Rate" yLabel="True Positive Rate" diagonal zoomed
          />
        )}
        {zoomed === "pr" && pr && (
          <CurveChart
            title="Precision–Recall curves" subtitle={`Baseline (default rate) = ${fmtPct(comparison.baseline_rate)}`}
            curves={pr} activeModels={active} xLabel="Recall" yLabel="Precision" zoomed
          />
        )}
      </Modal>
    </div>
  );
}
