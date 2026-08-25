import { useRef } from "react";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { Loading, ErrorBox } from "../components/ui/Loading";
import { StatTile } from "../components/ui/StatTile";
import { Card, CardHeader } from "../components/ui/Card";
import { ScrollVideo } from "../components/ScrollVideo";
import { fmtNum, fmtPct, fmtRM } from "../lib/format";

const PROBLEMS = [
  {
    tag: "01 — Predictive gap",
    title: "Linear scorecards miss non-linear risk",
    body: "Lenders use simple, interpretable models for compliance — but they miss complex risk patterns, wrongly declining creditworthy borrowers.",
  },
  {
    tag: "02 — Regulatory deadlock",
    title: "Black-box models can't be explained",
    body: "Ensemble models like XGBoost reach decisions through thousands of trees — too complex to explain, which “right to explanation” rules require.",
  },
  {
    tag: "03 — False trade-off",
    title: "Accuracy vs. transparency isn't a choice",
    body: "Banks are forced to pick: a weak model they can explain, or an accurate one they can't — risking bad loans or legal exposure.",
  },
];

const OBJECTIVES = [
  "Train a high-accuracy XGBoost model for credit risk.",
  "Explain every decision with SHAP, feature by feature.",
  "Benchmark against Logistic Regression, the compliance-friendly baseline.",
  "Put it in a dashboard evaluators can actually use.",
];

const USERS = [
  { role: "Credit Evaluators & Loan Officers", desc: "Need a defensible reason behind every approval or decline." },
  { role: "Bank Risk Managers & Auditors", desc: "Need to audit the model's behavior, not just its accuracy." },
  { role: "Financial Regulatory Bodies", desc: "Need proof black-box models can meet explanation requirements." },
];

const BENEFITS = [
  { stat: "Seconds, not days", label: "Automated risk assessment vs. manual review backlog" },
  { stat: "Fewer false rejections", label: "Ensemble learning outperforms linear scorecards on non-linear risk" },
  { stat: "Consistent grading", label: "Every applicant assessed against the same mathematical logic" },
  { stat: "SDG 8 aligned", label: "Transparent, explainable decisions support inclusive access to finance" },
];

const PIPELINE_STEPS = [
  { title: "Data & EDA", desc: "1.6M+ LendingClub loans (2014–2020), winsorized outliers, engineered credit-age & sub-grade features." },
  { title: "Model Bench", desc: "Logistic Regression, Decision Tree, Random Forest & XGBoost — baseline and hyperparameter-tuned." },
  { title: "Calibration", desc: "Isotonic regression on out-of-fold predictions maps raw scores to true default probabilities." },
  { title: "Explainability", desc: "SHAP (TreeExplainer) attributes every prediction to individual borrower features." },
  { title: "Decisioning", desc: "Threshold chosen by balancing recall against financial cost — see Threshold Optimizer." },
];

function GlanceCard({ data, onNavigate }) {
  const rts = data.finance.realistic_test_set;
  const baseline = rts.baseline_approve_all_cost;
  const totalCost = rts.total_cost;
  const savings = rts.savings_vs_no_model;
  const saves = savings >= 0;
  const pct = (Math.abs(savings) / baseline) * 100;

  return (
    <Card>
      <CardHeader
        eyebrow={`At a glance · held-out test set, LGD ${fmtPct(rts.lgd_used, 0)}`}
        title="What predictive modelling is worth"
        subtitle={`${fmtNum(rts.n_test)} loans the model never saw during training`}
      />
      <div className="grid sm:grid-cols-3 gap-5 mt-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Without a model</div>
          <div className="text-[26px] font-mono font-bold" style={{ color: "var(--risk-high)" }}>-{fmtRM(baseline)}</div>
          <div className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>Approve every applicant</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>With this model</div>
          <div className="text-[26px] font-mono font-bold" style={{ color: "var(--risk-high)" }}>-{fmtRM(totalCost)}</div>
          <div className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>At the chosen threshold</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>{saves ? "Savings" : "Added cost"}</div>
          <div className="text-[30px] font-mono font-extrabold" style={{ color: saves ? "var(--risk-low)" : "var(--risk-high)" }}>
            {saves ? "+" : "-"}{fmtRM(Math.abs(savings))}
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{pct.toFixed(1)}% {saves ? "lower" : "higher"} cost</div>
        </div>
      </div>

      <button
        onClick={() => onNavigate("threshold")}
        className="text-[11.5px] font-medium mt-4"
        style={{ color: "var(--accent)" }}
      >
        See how this threshold was chosen →
      </button>
    </Card>
  );
}

export function Home({ onNavigate }) {
  const wrapperRef = useRef(null);
  const contentRef = useRef(null);
  const { data, error, loading } = useApi(() => api.overview(), []);

  return (
    <div>
      <div ref={wrapperRef} style={{ height: "255vh" }}>
        <ScrollVideo src="/videos/demo-3.mp4" wrapperRef={wrapperRef}>
          <div className="flex-1 flex flex-col justify-center px-6 lg:px-16 max-w-[1180px] mx-auto w-full">
            <div className="text-[11px] tracking-[0.16em] uppercase font-medium mb-4" style={{ color: "var(--accent)" }}>
              REFRACTO · Enchancing Transparency in Credit Risk
            </div>
            <h1 className="text-[50px] leading-[1.05] font-semibold tracking-tight mb-5 max-w-[760px]" style={{ color: "var(--text)" }}>
              A hybrid XAI framework that makes credit decisions <span className="text-prism">defensible.</span>
            </h1>
            {/* Sits over the scroll-scrubbed hero video, whose brightness varies by frame (dark
                glass vs. bright light-beam patches) — a flat color alone can't guarantee contrast
                against every frame, so a dark shadow halo backs the text regardless of what's
                playing behind it. */}
            <p
              className="max-w-[580px] text-[16px] leading-relaxed mb-8"
              style={{ color: "var(--text)"}}
            >
              Accurate models are usually black boxes. Transparent models are usually weak. This project pairs
              a tuned <span style={{ color: "var(--accent)" }}>XGBoost</span> model with <span style={{ color: "var(--accent)" }}>SHAP</span> explanations
              — so every credit decision is both accurate and easy to justify.
            </p>
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => onNavigate("simulator")}
                className="px-5 py-3 rounded-lg text-[14.5px] font-semibold transition-transform hover:scale-[1.02]"
                style={{
                  backgroundImage: `
                    repeating-linear-gradient(45deg, rgba(255,255,255,0.16) 0 1px, transparent 1px 46px),
                    repeating-linear-gradient(-45deg, rgba(255,255,255,0.16) 0 1px, transparent 1px 46px),
                    conic-gradient(from 45deg, rgba(255,255,255,0.16) 0deg 90deg, transparent 90deg 180deg, rgba(28,18,8,0.16) 180deg 270deg, transparent 270deg 360deg),
                    linear-gradient(135deg, var(--accent), #c9863f)
                  `,
                  backgroundSize: "46px 46px, 46px 46px, 92px 92px, 100% 100%",
                  color: "var(--accent-ink)",
                  boxShadow: "0 8px 24px -8px rgba(224,164,88,0.45)",
                }}
              >
                ▶ Score an Application →
              </button>
              <button
                onClick={() => contentRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="px-5 py-3 rounded-lg text-[14.5px] font-medium transition-colors"
                style={{ background: "rgba(15,24,38,0.55)", color: "var(--text)", border: "1px solid var(--border)", backdropFilter: "blur(8px)" }}
              >
                Explore the framework
              </button>
            </div>
            <div className="mt-10 text-[11px] tracking-[0.12em] uppercase flex items-center gap-2" style={{ color: "var(--text-tertiary)" }}>
              Scroll to explore
              <span style={{ animation: "bob 1.6s ease-in-out infinite" }}>↓</span>
            </div>
            <style>{`@keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(4px); } }`}</style>
          </div>
        </ScrollVideo>
      </div>

      <div ref={contentRef} className="fade-in pt-8">
        <section className="mb-14">
          <h2 className="text-[20px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text)" }}>The problem</h2>
          <p className="text-[13px] mb-5" style={{ color: "var(--text-secondary)" }}>Why credit risk modeling is stuck between two bad options.</p>
          <div className="grid md:grid-cols-3 gap-4">
            {PROBLEMS.map((p) => (
              <Card key={p.title}>
                <div className="text-[10.5px] font-mono font-semibold mb-2" style={{ color: "var(--accent)" }}>{p.tag}</div>
                <div className="text-[15.5px] font-semibold mb-2 leading-snug" style={{ color: "var(--text)" }}>{p.title}</div>
                <div className="text-[12.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{p.body}</div>
              </Card>
            ))}
          </div>
        </section>

        <section className="mb-14 grid lg:grid-cols-[1fr_1.1fr] gap-8">
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text)" }}>The approach</h2>
            <p className="text-[13px] mb-5" style={{ color: "var(--text-secondary)" }}>Four objectives, one hybrid framework.</p>
            <div className="flex flex-col gap-3">
              {OBJECTIVES.map((o, i) => (
                <div key={o} className="flex gap-3 items-start">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono font-bold shrink-0 mt-0.5"
                    style={{ background: "var(--accent-2-soft)", color: "var(--accent-2)", border: "1px solid var(--accent-2-border)" }}
                  >
                    {i + 1}
                  </div>
                  <div className="text-[13.5px] leading-relaxed pt-0.5" style={{ color: "var(--text-secondary)" }}>{o}</div>
                </div>
              ))}
            </div>
          </div>

          <Card>
            <div className="text-[13px] font-semibold uppercase tracking-wide mb-4" style={{ color: "var(--text)" }}>Who this is for</div>
            <div className="flex flex-col gap-4">
              {USERS.map((u) => (
                <div key={u.role} style={{ borderLeft: "2px solid var(--accent-border)" }} className="pl-3.5">
                  <div className="text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>{u.role}</div>
                  <div className="text-[12.5px] mt-0.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{u.desc}</div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        {loading && <Loading label="Loading dataset overview…" />}
        {error && <ErrorBox message={error} />}

        {data && (
          <>
            <section className="mb-8">
              <GlanceCard data={data} onNavigate={onNavigate} />
            </section>

            <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-14">
              <StatTile label="Training rows" value={fmtNum(data.n_rows)} sub="LendingClub 2014–2020" />
              <StatTile label="Features trained" value={`${data.n_features_encoded}`} sub={`${data.n_features_raw} raw → ${data.n_features_encoded} encoded`} />
              <StatTile label="Default rate" value={fmtPct(data.default_rate)} sub="Class imbalance ~1:4" />
              <StatTile label="Best model ROC-AUC" value={data.best_roc_auc.toFixed(4)} sub={data.best_model} accent />
              <StatTile label="Brier score (calibrated)" value={data.brier_isotonic.toFixed(4)} sub="Isotonic regression" />
            </section>

            <section className="grid md:grid-cols-2 gap-4 mb-14">
              <Card>
                <CardHeader eyebrow="Decisioning" title="Chosen operating threshold" subtitle="See the Threshold Optimizer for the full trade-off curve" />
                <div className="text-3xl font-mono font-semibold" style={{ color: "var(--accent)" }}>
                  {data.operating_threshold.toFixed(4)}
                </div>
                <p className="text-[12.5px] mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Applicants scoring above this line get flagged for decline — a deliberate balance between
                  minimizing cost and catching more defaults at LGD {fmtPct(data.finance.lgd_used, 0)}, not an
                  arbitrary cutoff.
                </p>
                <button
                  onClick={() => onNavigate("threshold")}
                  className="text-[11.5px] font-medium mt-2"
                  style={{ color: "var(--accent)" }}
                >
                  Explore the trade-off curve →
                </button>
              </Card>

              <Card>
                <CardHeader
                  eyebrow="Theoretical ceiling · not achievable"
                  title={`Perfect-foresight value at LGD ${fmtPct(data.finance.lgd_used, 0)}`}
                  subtitle="If the model knew every default in advance, full dataset"
                />
                <div className="flex items-end gap-6 mt-2">
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Interest earned</div>
                    <div className="text-lg font-mono font-semibold" style={{ color: "var(--risk-low)" }}>{fmtRM(data.finance.total_interest)}</div>
                  </div>
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Default loss</div>
                    <div className="text-lg font-mono font-semibold" style={{ color: "var(--risk-high)" }}>-{fmtRM(data.finance.default_loss)}</div>
                  </div>
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Net</div>
                    <div className="text-lg font-mono font-semibold" style={{ color: "var(--accent)" }}>{fmtRM(data.finance.net_value)}</div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 rounded-full overflow-hidden flex" style={{ background: "var(--bg-elevated-2)" }}>
                  <div style={{ width: `${(data.finance.net_value / data.finance.total_interest) * 100}%`, background: "var(--risk-low)" }} />
                  <div style={{ width: `${(data.finance.default_loss / data.finance.total_interest) * 100}%`, background: "var(--risk-high)" }} />
                </div>
              </Card>
            </section>

            <section className="mb-14">
              <CardHeader eyebrow="Methodology" title="How the framework works" subtitle="From raw loan applications to an explainable decision" />
              <div className="grid md:grid-cols-5 gap-3">
                {PIPELINE_STEPS.map((step, i) => (
                  <div key={step.title} className="card p-4 relative">
                    <div className="font-mono text-[11px] mb-2" style={{ color: "var(--accent)" }}>
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="text-[13px] font-semibold mb-1.5" style={{ color: "var(--text)" }}>{step.title}</div>
                    <div className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{step.desc}</div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <section className="mb-14">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text)" }}>Why it matters</h2>
          <p className="text-[13px] mb-5" style={{ color: "var(--text-secondary)" }}>Aligned with SDG 8 — Decent Work and Economic Growth (Target 8.10).</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {BENEFITS.map((b) => (
              <Card key={b.label} className="text-center py-6">
                <div className="text-[17px] font-bold font-mono mb-1.5" style={{ color: "var(--accent)" }}>{b.stat}</div>
                <div className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{b.label}</div>
              </Card>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <Card className="text-center py-10">
            <div className="text-[19px] font-semibold mb-2" style={{ color: "var(--text)" }}>See it decide, and explain itself.</div>
            <p className="text-[13px] max-w-[480px] mx-auto mb-6" style={{ color: "var(--text-secondary)" }}>
              Run a real or custom borrower through the model and get a calibrated default probability
              with a full SHAP breakdown of why.
            </p>
            <button
              onClick={() => onNavigate("simulator")}
              className="px-5 py-3 rounded-lg text-[14.5px] font-semibold transition-transform hover:scale-[1.02] inline-block"
              style={{
                backgroundImage: `
                  repeating-linear-gradient(45deg, rgba(255,255,255,0.16) 0 1px, transparent 1px 46px),
                  repeating-linear-gradient(-45deg, rgba(255,255,255,0.16) 0 1px, transparent 1px 46px),
                  conic-gradient(from 45deg, rgba(255,255,255,0.16) 0deg 90deg, transparent 90deg 180deg, rgba(28,18,8,0.16) 180deg 270deg, transparent 270deg 360deg),
                  linear-gradient(135deg, var(--accent), #c9863f)
                `,
                backgroundSize: "46px 46px, 46px 46px, 92px 92px, 100% 100%",
                color: "var(--accent-ink)",
                boxShadow: "0 8px 24px -8px rgba(224,164,88,0.45)",
              }}
            >
              ▶ Score an Application →
            </button>
          </Card>
        </section>
      </div>
    </div>
  );
}
