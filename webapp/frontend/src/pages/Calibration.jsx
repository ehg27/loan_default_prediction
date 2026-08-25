import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { Loading, ErrorBox } from "../components/ui/Loading";
import { Card, CardHeader } from "../components/ui/Card";
import { StatTile } from "../components/ui/StatTile";
import { fmtPct } from "../lib/format";

export function Calibration() {
  const { data, error, loading } = useApi(() => api.calibration(), []);
  if (loading) return <Loading label="Loading calibration curves…" />;
  if (error) return <ErrorBox message={error} />;

  const raw = data.raw.predicted.map((p, i) => ({ x: p, y: data.raw.observed[i] }));
  const iso = data.isotonic.predicted.map((p, i) => ({ x: p, y: data.isotonic.observed[i] }));
  const brierImprovement = 1 - data.brier_isotonic / data.brier_raw;

  return (
    <div>
      <header className="mb-6">
        <div className="text-[11px] tracking-[0.16em] uppercase font-medium mb-2" style={{ color: "var(--accent)" }}>Reliability</div>
        <h1 className="text-[26px] font-semibold" style={{ color: "var(--text)" }}>Probability calibration</h1>
        <p className="text-[13.5px] mt-1" style={{ color: "var(--text-secondary)" }}>
          A raw XGBoost score is a ranking signal, not a true probability. Isotonic regression (fit on
          out-of-fold predictions) remaps it so "30% predicted" really means ~30% observed default rate —
          a requirement for the financial cost analysis to be meaningful.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatTile label="Brier — raw" value={data.brier_raw.toFixed(4)} />
        <StatTile label="Brier — isotonic" value={data.brier_isotonic.toFixed(4)} accent />
        <StatTile label="Improvement" value={fmtPct(brierImprovement)} sub="lower Brier = better" />
        <StatTile label="Mean calibrated PD" value={fmtPct(data.mean_calibrated_pd)} sub={`vs. actual rate ${fmtPct(data.actual_default_rate)}`} />
      </div>

      <Card>
        <CardHeader
          eyebrow="Test set · 10 quantile bins"
          title="Reliability diagram"
          subtitle="Mean predicted probability vs. observed default rate — closer to the diagonal is better calibrated"
        />
        <ResponsiveContainer width="100%" height={380}>
          <LineChart margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number" dataKey="x" domain={[0, 1]} tick={{ fill: "var(--text-tertiary)", fontSize: 11 }}
              tickFormatter={(v) => v.toFixed(1)} stroke="var(--border)"
              label={{ value: "Mean predicted probability", position: "insideBottom", offset: -2, fill: "var(--text-tertiary)", fontSize: 11 }}
            />
            <YAxis
              type="number" domain={[0, 1]} tick={{ fill: "var(--text-tertiary)", fontSize: 11 }}
              tickFormatter={(v) => v.toFixed(1)} stroke="var(--border)"
              label={{ value: "Observed default rate", angle: -90, position: "insideLeft", fill: "var(--text-tertiary)", fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{ background: "var(--bg-elevated-2)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
              formatter={(v) => Number(v).toFixed(4)}
              isAnimationActive={false}
            />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="var(--text-tertiary)" strokeDasharray="4 4" ifOverflow="extendDomain" />
            <Line data={raw} dataKey="y" name="Raw XGBoost" stroke="#c45c70" strokeWidth={1.8} dot={{ r: 3.5 }} isAnimationActive={false} />
            <Line data={iso} dataKey="y" name="Isotonic calibrated" stroke="var(--accent)" strokeWidth={2.4} dot={{ r: 3.5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
