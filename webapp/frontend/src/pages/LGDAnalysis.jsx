import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine, Cell,
} from "recharts";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { Loading, ErrorBox } from "../components/ui/Loading";
import { Card, CardHeader } from "../components/ui/Card";
import { StatTile } from "../components/ui/StatTile";
import { fmtPct, fmtNum } from "../lib/format";

export function LGDAnalysis() {
  const { data, error, loading } = useApi(() => api.lgdAnalysis(), []);
  if (loading) return <Loading label="Loading LGD analysis…" />;
  if (error) return <ErrorBox message={error} />;

  const { summary, by_vintage, mature_vintage_range, loan_status_counts, defaulted_statuses } = data;
  const [matureLow, matureHigh] = mature_vintage_range.years.split("-").map(Number);

  return (
    <div>
      <header className="mb-6">
        <div className="text-[11px] tracking-[0.16em] uppercase font-medium mb-2" style={{ color: "var(--accent)" }}>
          How we calculated this
        </div>
        <h1 className="text-[26px] font-semibold" style={{ color: "var(--text)" }}>
          How much of a defaulted loan is actually lost?
        </h1>
        <p className="text-[13.5px] mt-1 max-w-[720px]" style={{ color: "var(--text-secondary)" }}>
          When a borrower defaults, the lender doesn't lose the whole loan — some money usually comes back, either
          from payments made before the default or from debt collection afterward. The share that's <i>never</i> recovered
          is called Loss Given Default (LGD), and it's used everywhere in this dashboard to turn a default
          probability into an estimated dollar loss. Rather than assume a typical industry figure, we calculated it
          directly from real outcomes on {fmtNum(data.resolved_defaulted_count)} loans that actually defaulted.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatTile label="Loans we looked at" value={fmtNum(data.resolved_defaulted_count)} sub={`out of ${fmtNum(data.total_rows)} loans total`} />
        <StatTile label="Average loss, all years" value={fmtPct(summary.all_vintages.weighted_mean)} />
        <StatTile label="Average loss, 2014–2018" value={fmtPct(summary.overlap_2014_2018.weighted_mean)} sub="same years as this project's data" />
        <StatTile label="Loss figure this dashboard uses" value={fmtPct(data.adopted_lgd, 0)} accent />
      </div>

      <Card className="mb-6">
        <CardHeader
          eyebrow="Step 1 · which loans count"
          title="Only fully defaulted loans are counted"
          subtitle="A loan only has a final, measurable loss once it's been formally written off (“Charged Off”) — a loan that's just a few payments late hasn't reached that point yet, so it's left out"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ color: "var(--text-tertiary)" }}>
                <th className="text-left font-medium pb-2">Loan status</th>
                <th className="text-right font-medium pb-2">Count</th>
                <th className="text-right font-medium pb-2">Share</th>
                <th className="text-left font-medium pb-2 pl-4">Counted?</th>
              </tr>
            </thead>
            <tbody>
              {loan_status_counts.map((row) => {
                const used = defaulted_statuses.includes(row.status);
                return (
                  <tr key={row.status} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="py-1.5" style={{ color: "var(--text)" }}>{row.status}</td>
                    <td className="py-1.5 text-right font-mono" style={{ color: "var(--text)" }}>{fmtNum(row.count)}</td>
                    <td className="py-1.5 text-right font-mono" style={{ color: "var(--text-tertiary)" }}>{fmtPct(row.count / data.total_rows)}</td>
                    <td className="py-1.5 pl-4">
                      {used ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                          yes
                        </span>
                      ) : (
                        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mb-6">
        <CardHeader
          eyebrow="Step 2 · the calculation"
          title="How the loss percentage is worked out for each loan"
        />
        <p className="text-[13px] leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
          For each defaulted loan, start with the amount originally lent out. Subtract whatever the borrower
          had already paid back before defaulting, then subtract whatever was recovered afterward through debt
          collection (minus the fee paid to the collection agency). What's left, as a percentage of the original
          loan amount, is that loan's loss.
        </p>
        <div
          className="font-mono text-[12.5px] px-4 py-3 rounded-lg mb-3"
          style={{ background: "var(--bg-elevated-2)", color: "var(--accent)", overflowX: "auto" }}
        >
          loss % = (loan amount − amount repaid before default − amount recovered after) / loan amount
        </div>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          This matches how the rest of the dashboard estimates dollar losses (default probability × loan amount ×
          this loss percentage) — using the loan's original amount, since that's what's known upfront, before
          knowing how much of it will ever be repaid. A tiny share of loans ({fmtPct(data.clipping.share_below_0, 2)})
          show more money recovered than was ever lost, from rounding — those are treated as a 0% loss rather than
          a negative one.
        </p>
      </Card>

      <Card className="mb-6">
        <CardHeader
          eyebrow="Step 3 · does loan age matter?"
          title="Checking whether older or newer loans skew the result"
          subtitle="Loans are grouped here by the year they were first issued — that's what “vintage” means below"
        />
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={by_vintage} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis dataKey="issue_year" tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} stroke="var(--border)" />
            <YAxis
              domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} stroke="var(--border)"
            />
            <Tooltip
              contentStyle={{ background: "var(--bg-elevated-solid)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: "var(--text)", fontWeight: 600, marginBottom: 4 }}
              itemStyle={{ color: "var(--text-secondary)" }}
              formatter={(v, name) => [`${(v * 100).toFixed(1)}%`, name]}
              labelFormatter={(y) => `Loans issued in ${y}`}
              isAnimationActive={false}
            />
            <ReferenceArea x1={matureLow} x2={matureHigh} fill="var(--risk-low)" fillOpacity={0.08} />
            <ReferenceLine y={data.adopted_lgd} stroke="var(--accent)" strokeDasharray="4 4" label={{ value: `Dashboard uses ${fmtPct(data.adopted_lgd, 0)}`, position: "right", fill: "var(--accent)", fontSize: 11 }} />
            <Bar id="lgd-by-vintage-bar" dataKey="weighted_lgd" name="Average loss" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {by_vintage.map((row) => (
                <Cell
                  key={row.issue_year}
                  fill={row.issue_year >= matureLow && row.issue_year <= matureHigh ? "var(--risk-low)" : "var(--text-tertiary)"}
                  fillOpacity={row.issue_year >= matureLow && row.issue_year <= matureHigh ? 0.85 : 0.45}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[13px] leading-relaxed mt-3" style={{ color: "var(--text-secondary)" }}>
          Debt collection can take months or even years to finish. So a loan that defaulted only recently (like
          2017 or 2018 here) is still, at the moment this data was captured, in the middle of that process — its
          "amount recovered so far" is artificially low simply because collection isn't done yet, which makes its
          measured loss look artificially high (climbing toward 90%). The shaded years (2012–2015, highlighted in
          green) are old enough that collection has fully finished, so their loss numbers
          ({fmtPct(mature_vintage_range.weighted_lgd_low, 0)}–{fmtPct(mature_vintage_range.weighted_lgd_high, 0)}) are
          the ones we trust — this is why we didn't just average every year together.
        </p>
      </Card>

      <Card>
        <CardHeader eyebrow="Conclusion" title={`Why this dashboard uses ${fmtPct(data.adopted_lgd, 0)}`} />
        <div className="grid sm:grid-cols-3 gap-4 mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Every year averaged together</div>
            <div className="text-[20px] font-mono font-bold" style={{ color: "var(--text)" }}>{fmtPct(summary.all_vintages.weighted_mean)}</div>
            <div className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>pulled up by recent, still-in-progress loans</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Only fully-resolved years (2012–2015)</div>
            <div className="text-[20px] font-mono font-bold" style={{ color: "var(--risk-low)" }}>
              {fmtPct(mature_vintage_range.weighted_lgd_low, 0)}–{fmtPct(mature_vintage_range.weighted_lgd_high, 0)}
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>the trustworthy range</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>What we use</div>
            <div className="text-[20px] font-mono font-bold" style={{ color: "var(--accent)" }}>{fmtPct(data.adopted_lgd, 0)}</div>
            <div className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>the middle of that trustworthy range</div>
          </div>
        </div>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {fmtPct(data.adopted_lgd, 0)} is the loss figure this dashboard uses everywhere it estimates a dollar
          amount — including the Threshold Optimizer's cost calculations. It comes straight from real recovery
          data on defaulted loans rather than a guess, and picking the middle of the trustworthy 2012–2015 range
          keeps it from being skewed by loans whose recovery process isn't finished yet.
        </p>
      </Card>
    </div>
  );
}
