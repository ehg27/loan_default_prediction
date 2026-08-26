import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { Loading, ErrorBox } from "../components/ui/Loading";
import { Card, CardHeader } from "../components/ui/Card";
import { Field, Input, Select } from "../components/ui/Field";
import { Modal, ZoomButton } from "../components/ui/Modal";
import { ShapWaterfall } from "../components/ShapWaterfall";
import { fmtPct, fmtUSD } from "../lib/format";

const PURPOSE_LABEL = (p) => p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const OUTCOME_META = {
  TP: { label: "Correctly caught default", color: "var(--risk-high)" },
  TN: { label: "Correctly approved", color: "var(--risk-low)" },
  FP: { label: "Wrongly declined", color: "var(--risk-mid)" },
  FN: { label: "Wrongly approved (missed default)", color: "#d8748a" },
};

function defaultForm(meta) {
  return {
    loan_amnt: Math.round(meta.defaults.loan_amnt),
    term: 36,
    sub_grade: "B3",
    home_ownership: "RENT",
    verification_status: "Verified",
    purpose: "debt_consolidation",
    addr_state: "CA",
    annual_inc: Math.round(meta.defaults.annual_inc),
    dti: meta.bounds.dti.median,
    revol_util_pct: Math.round(meta.bounds.revol_util.median * 100),
    revol_bal: Math.round(meta.bounds.revol_bal.median),
    open_acc: Math.round(meta.bounds.open_acc.median),
    mort_acc: Math.round(meta.bounds.mort_acc.median),
    has_pub_rec: false,
    credit_age_years: Math.round(meta.defaults.credit_age_years),
  };
}

function formFromCase(borrower) {
  return {
    loan_amnt: borrower.loan_amnt,
    term: borrower.term,
    sub_grade: borrower.sub_grade,
    home_ownership: borrower.home_ownership,
    verification_status: borrower.verification_status,
    purpose: borrower.purpose,
    addr_state: borrower.addr_state,
    annual_inc: Math.round(borrower.annual_inc),
    dti: borrower.dti,
    revol_util_pct: Math.round(borrower.revol_util * 100),
    revol_bal: Math.round(borrower.revol_bal),
    open_acc: Math.round(borrower.open_acc),
    mort_acc: Math.round(borrower.mort_acc),
    has_pub_rec: borrower.has_pub_rec,
    credit_age_years: borrower.credit_age_years,
  };
}

function CaseCard({ c, onLoad, active }) {
  const meta = OUTCOME_META[c.outcome];
  return (
    <button
      onClick={() => onLoad(c)}
      className="w-full text-left p-3 rounded-xl mb-2 transition-colors"
      style={{
        background: active ? "var(--bg-hover)" : "transparent",
        border: `1px solid ${active ? "var(--accent-border)" : "var(--border-subtle)"}`,
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
          {fmtUSD(c.borrower.loan_amnt)} · {c.borrower.sub_grade}
        </span>
        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-elevated-2)", color: meta.color }}>
          {c.outcome}
        </span>
      </div>
      <div className="text-[11px] mb-1.5" style={{ color: "var(--text-tertiary)" }}>
        {c.borrower.purpose.replace(/_/g, " ")} · {c.borrower.home_ownership.toLowerCase()} · {c.borrower.addr_state}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span style={{ color: c.predicted ? "var(--risk-high)" : "var(--risk-low)" }} className="font-semibold">
          → {c.predicted_label}
        </span>
        <span className="font-mono" style={{ color: "var(--text-secondary)" }}>{fmtPct(c.calibrated_pd, 1)}</span>
      </div>
    </button>
  );
}

export function TryIt() {
  const { data: meta, loading: metaLoading, error: metaError } = useApi(() => api.formMeta(), []);
  const { data: cases, loading: casesLoading } = useApi(() => api.cases(), []);
  const [form, setForm] = useState(null);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [outcomeFilter, setOutcomeFilter] = useState("TP");
  const [activeCaseId, setActiveCaseId] = useState(null);
  const [zoomShap, setZoomShap] = useState(false);
  const [explainModel, setExplainModel] = useState("xgboost");

  useEffect(() => {
    if (meta && !form) setForm(defaultForm(meta));
  }, [meta]);

  async function runPredict(payload) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.predict(payload);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function payloadFromForm(f) {
    return {
      loan_amnt: Number(f.loan_amnt),
      term: Number(f.term),
      sub_grade: f.sub_grade,
      home_ownership: f.home_ownership,
      verification_status: f.verification_status,
      purpose: f.purpose,
      addr_state: f.addr_state,
      annual_inc: Number(f.annual_inc),
      dti: Number(f.dti),
      revol_util: Number(f.revol_util_pct) / 100,
      revol_bal: Number(f.revol_bal),
      open_acc: Number(f.open_acc),
      mort_acc: Number(f.mort_acc),
      has_pub_rec: f.has_pub_rec,
      credit_age_years: Number(f.credit_age_years),
    };
  }

  function handleSubmit(e) {
    e.preventDefault();
    setActiveCaseId(null);
    runPredict(payloadFromForm(form));
  }

  function loadCase(c) {
    const nextForm = formFromCase(c.borrower);
    setForm(nextForm);
    setActiveCaseId(c.id);
    runPredict(payloadFromForm(nextForm));
  }

  if (metaLoading) return <Loading label="Loading borrower form…" />;
  if (metaError) return <ErrorBox message={metaError} />;
  if (!form) return null;

  const subGrades = Object.keys(meta.sub_grade_mapping);
  const filteredCases = (cases || []).filter((c) => c.outcome === outcomeFilter);
  const activeCase = (cases || []).find((c) => c.id === activeCaseId);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div>
      <header className="mb-6">
        <div className="text-[11px] tracking-[0.16em] uppercase font-medium mb-2" style={{ color: "var(--accent)" }}>Live inference</div>
        <h1 className="text-[26px] font-semibold" style={{ color: "var(--text)" }}>Live Application Scoring</h1>
        <p className="text-[13.5px] mt-1 max-w-[720px]" style={{ color: "var(--text-secondary)" }}>
          Load a real borrower from the held-out test set, or build a custom application. The tuned XGBoost model
          scores it, isotonic regression calibrates the probability, and SHAP explains exactly which features
          drove the decision — the same pipeline a credit evaluator would see.
        </p>
      </header>

      {/* Case browser — full width, on top */}
      <Card className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="text-[11px] uppercase tracking-wide font-semibold px-1" style={{ color: "var(--text-tertiary)" }}>
            Real test-set cases
          </div>
          <div className="flex gap-1.5">
            {Object.keys(OUTCOME_META).map((oc) => (
              <button
                key={oc}
                onClick={() => setOutcomeFilter(oc)}
                className="text-[10.5px] font-mono font-bold px-3 py-1.5 rounded-md"
                style={{
                  background: outcomeFilter === oc ? "var(--accent-soft)" : "var(--bg-elevated-2)",
                  color: outcomeFilter === oc ? "var(--accent)" : "var(--text-tertiary)",
                }}
              >
                {oc}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[11px] mb-3 px-1 leading-snug" style={{ color: "var(--text-tertiary)" }}>
          {OUTCOME_META[outcomeFilter].label}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
          {casesLoading && <Loading label="Loading cases…" />}
          {filteredCases.map((c) => (
            <CaseCard key={c.id} c={c} onLoad={loadCase} active={activeCaseId === c.id} />
          ))}
        </div>
      </Card>

      <div className="grid lg:grid-cols-[440px_1fr] gap-6 items-start">
        {/* Form */}
        <Card className="!p-0">
          <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
            <CardHeader
              eyebrow={activeCaseId ? `Loaded: Borrower #${activeCaseId}` : "Custom application"}
              title="Application details"
            />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Loan amount" hint="$">
                <Input type="number" min={500} step="any" value={form.loan_amnt} onChange={(e) => set("loan_amnt", e.target.value)} required />
              </Field>
              <Field label="Term">
                <Select value={form.term} onChange={(e) => set("term", e.target.value)}>
                  <option value={36}>36 months</option>
                  <option value={60}>60 months</option>
                </Select>
              </Field>
              <Field label="Sub-grade" hint="risk grade">
                <Select value={form.sub_grade} onChange={(e) => set("sub_grade", e.target.value)}>
                  {subGrades.map((g) => <option key={g} value={g}>{g}</option>)}
                </Select>
              </Field>
              <Field label="Purpose">
                <Select value={form.purpose} onChange={(e) => set("purpose", e.target.value)}>
                  {meta.categories.purpose.map((p) => <option key={p} value={p}>{PURPOSE_LABEL(p)}</option>)}
                </Select>
              </Field>
            </div>

            <CardHeader eyebrow="Borrower" title="Income & residence" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Annual income" hint="$">
                <Input type="number" min={0} step="any" value={form.annual_inc} onChange={(e) => set("annual_inc", e.target.value)} required />
              </Field>
              <Field label="Home ownership">
                <Select value={form.home_ownership} onChange={(e) => set("home_ownership", e.target.value)}>
                  {meta.categories.home_ownership.map((v) => <option key={v} value={v}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Income verification">
                <Select value={form.verification_status} onChange={(e) => set("verification_status", e.target.value)}>
                  {meta.categories.verification_status.map((v) => <option key={v} value={v}>{v}</option>)}
                </Select>
              </Field>
              <Field label="State">
                <Select value={form.addr_state} onChange={(e) => set("addr_state", e.target.value)}>
                  {meta.categories.addr_state.map((v) => <option key={v} value={v}>{v}</option>)}
                </Select>
              </Field>
            </div>

            <CardHeader eyebrow="Credit profile" title="Credit history" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Debt-to-income" hint="%">
                <Input type="number" min={0} step="any" value={form.dti} onChange={(e) => set("dti", e.target.value)} required />
              </Field>
              <Field label="Revolving utilization" hint="%">
                <Input type="number" min={0} max={100} step={1} value={form.revol_util_pct} onChange={(e) => set("revol_util_pct", e.target.value)} required />
              </Field>
              <Field label="Revolving balance" hint="$">
                <Input type="number" min={0} step="any" value={form.revol_bal} onChange={(e) => set("revol_bal", e.target.value)} required />
              </Field>
              <Field label="Open credit lines">
                <Input type="number" min={0} step={1} value={form.open_acc} onChange={(e) => set("open_acc", e.target.value)} required />
              </Field>
              <Field label="Mortgage accounts">
                <Input type="number" min={0} step={1} value={form.mort_acc} onChange={(e) => set("mort_acc", e.target.value)} required />
              </Field>
              <Field label="Credit age" hint="years">
                <Input type="number" min={0} step="any" value={form.credit_age_years} onChange={(e) => set("credit_age_years", e.target.value)} required />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={form.has_pub_rec} onChange={(e) => set("has_pub_rec", e.target.checked)} />
              Has a derogatory public record (bankruptcy/collections)
            </label>

            <button
              type="submit" disabled={submitting}
              className="mt-1 px-4 py-2.5 rounded-lg text-[13.5px] font-semibold disabled:opacity-50"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              {submitting ? "Scoring…" : "Score this application →"}
            </button>
            {error && <ErrorBox message={error} />}
          </form>
        </Card>

        {/* Results */}
        <div className="flex flex-col gap-5">
          {!result && !submitting && (
            <Card className="flex items-center justify-center py-24 text-center">
              <div style={{ color: "var(--text-tertiary)" }} className="text-[13px] max-w-[280px]">
                Load a case from above, or fill in a custom application, to see the calibrated default
                probability and full SHAP explanation.
              </div>
            </Card>
          )}
          {submitting && <Card><Loading label="Running model + computing SHAP values…" /></Card>}

          {result && !submitting && (
            <>
              <Card>
                {activeCase && (
                  <div className="flex items-center justify-between mb-3 pb-3 text-[12px]" style={{ borderBottom: "1px solid var(--border)", color: "var(--text-tertiary)" }}>
                    <span>Actual outcome (test set)</span>
                    <span className="font-semibold" style={{ color: activeCase.actual ? "var(--risk-high)" : "var(--risk-low)" }}>
                      {activeCase.actual_label}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "var(--text-tertiary)" }}>Model decision</div>
                    <div className="text-[28px] font-bold leading-none" style={{ color: result.predicted_default ? "var(--risk-high)" : "var(--risk-low)" }}>
                      {result.predicted_default ? "DEFAULT" : "NO DEFAULT"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "var(--text-tertiary)" }}>Predicted default probability</div>
                    <div className="text-[28px] font-mono font-bold leading-none" style={{ color: "var(--accent)" }}>{fmtPct(result.calibrated_pd, 2)}</div>
                  </div>
                </div>
                <div className="mt-4 h-2 rounded-full relative" style={{ background: "var(--bg-elevated-2)" }}>
                  <div className="h-full rounded-full" style={{ width: `${result.calibrated_pd * 100}%`, background: result.predicted_default ? "var(--risk-high)" : "var(--risk-low)" }} />
                  <div className="absolute top-[-4px] w-0.5 h-4" style={{ left: `${result.threshold * 100}%`, background: "var(--text)" }} />
                </div>
                <div className="text-[11px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>
                  Decision threshold: <span className="font-mono">{result.threshold.toFixed(4)}</span>
                </div>
              </Card>

              <Card>
                <CardHeader
                  eyebrow="Benchmark"
                  title="XGBoost vs. Logistic Regression"
                  subtitle="Same borrower, same threshold — both PDs are isotonic-calibrated (LR gets its own calibrator, fit separately from XGBoost's)"
                />
                <div className="flex flex-col gap-2.5 mt-1">
                  {[
                    { key: "xgboost", label: "XGBoost (Tuned)", note: "calibrated PD" },
                    { key: "logistic_regression", label: "Logistic Regression", note: "calibrated PD" },
                  ].map(({ key, label, note }) => {
                    const m = result.model_comparison[key];
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <div className="w-[150px] shrink-0">
                          <div className="text-[12.5px] font-medium" style={{ color: "var(--text)" }}>{label}</div>
                          <div className="text-[10.5px]" style={{ color: "var(--text-tertiary)" }}>{note}</div>
                        </div>
                        <div className="flex-1 h-5 rounded relative" style={{ background: "var(--bg-elevated-2)" }}>
                          <div
                            className="h-full rounded"
                            style={{ width: `${m.pd * 100}%`, background: m.predicted_default ? "var(--risk-high)" : "var(--risk-low)", opacity: 0.85 }}
                          />
                          <div className="absolute top-[-2px] w-0.5 h-[26px]" style={{ left: `${result.threshold * 100}%`, background: "var(--text)", opacity: 0.5 }} />
                        </div>
                        <div className="w-16 text-right text-[12.5px] font-mono font-semibold shrink-0" style={{ color: m.predicted_default ? "var(--risk-high)" : "var(--risk-low)" }}>
                          {fmtPct(m.pd, 1)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {result.model_comparison.xgboost.predicted_default !== result.model_comparison.logistic_regression.predicted_default && (
                  <div className="mt-3 pt-2.5 text-[11.5px]" style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--accent)" }}>
                    The two models disagree on the decision for this borrower.
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader eyebrow="Financial impact" title="Expected Loss" subtitle="EL = Calibrated PD × Exposure at Default × Loss Given Default" />
                <div className="flex items-end gap-8 mt-1">
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>PD</div>
                    <div className="text-[15px] font-mono font-semibold">{fmtPct(result.calibrated_pd, 2)}</div>
                  </div>
                  <div className="text-[15px] font-mono" style={{ color: "var(--text-tertiary)" }}>×</div>
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>EAD</div>
                    <div className="text-[15px] font-mono font-semibold">{fmtUSD(result.exposure_at_default)}</div>
                  </div>
                  <div className="text-[15px] font-mono" style={{ color: "var(--text-tertiary)" }}>×</div>
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>LGD</div>
                    <div className="text-[15px] font-mono font-semibold">{fmtPct(result.lgd_used, 0)}</div>
                  </div>
                  <div className="text-[15px] font-mono" style={{ color: "var(--text-tertiary)" }}>=</div>
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wide" style={{ color: "var(--accent)" }}>Expected Loss</div>
                    <div className="text-[17px] font-mono font-bold" style={{ color: "var(--accent)" }}>{fmtUSD(result.expected_loss, false)}</div>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <CardHeader
                    eyebrow="Explanation"
                    title="Why the model decided this"
                    subtitle={explainModel === "xgboost"
                      ? "Every feature's SHAP contribution, ranked by impact — hover a bar for that customer's exact value"
                      : "Logistic Regression's own explanation — exact, not approximated: each bar is that feature's value times its fitted coefficient"}
                  />
                  <ZoomButton onClick={() => setZoomShap(true)} />
                </div>
                <div className="flex gap-1.5 mb-4">
                  {[["xgboost", "XGBoost"], ["lr", "Logistic Regression"]].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setExplainModel(key)}
                      className="px-2.5 py-1 rounded-md text-[12px] font-medium"
                      style={{
                        background: explainModel === key ? "var(--accent-soft)" : "var(--bg-elevated-2)",
                        color: explainModel === key ? "var(--accent)" : "var(--text-secondary)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <ShapWaterfall
                  key={explainModel}
                  baseValue={explainModel === "xgboost" ? result.base_value : result.lr_base_value}
                  contributions={explainModel === "xgboost" ? result.shap_contributions : result.lr_shap_contributions}
                  breakdown={explainModel === "xgboost" ? result.output_breakdown : result.lr_output_breakdown}
                />
              </Card>
            </>
          )}
        </div>
      </div>

      <Modal open={zoomShap} onClose={() => setZoomShap(false)} title={`Why the model decided this — zoomed (${explainModel === "xgboost" ? "XGBoost" : "Logistic Regression"})`} width={960}>
        {result && (
          <ShapWaterfall
            baseValue={explainModel === "xgboost" ? result.base_value : result.lr_base_value}
            contributions={explainModel === "xgboost" ? result.shap_contributions : result.lr_shap_contributions}
            breakdown={explainModel === "xgboost" ? result.output_breakdown : result.lr_output_breakdown}
          />
        )}
      </Modal>
    </div>
  );
}
