import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { Loading, ErrorBox } from "../components/ui/Loading";
import { Card, CardHeader } from "../components/ui/Card";
import { Modal, ZoomButton } from "../components/ui/Modal";
import { BeeswarmCanvas } from "../components/BeeswarmCanvas";
import { DependenceCanvas } from "../components/DependenceCanvas";
import { humanFeature } from "../lib/format";

const DIRECTION_BADGE = {
  higher_increases_risk: { text: "↑ higher = more risk", color: "var(--risk-high)" },
  higher_decreases_risk: { text: "↓ higher = less risk", color: "var(--risk-low)" },
  flat: { text: "mixed effect", color: "var(--text-tertiary)" },
};

function DirectionTag({ direction }) {
  const d = DIRECTION_BADGE[direction] || DIRECTION_BADGE.flat;
  return (
    <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "var(--bg-elevated-2)", color: d.color }}>
      {d.text}
    </span>
  );
}

function ImportanceBar({ title, subtitle, items, valueKey = "value", showDirection }) {
  const max = Math.max(...items.map((d) => d[valueKey]));
  return (
    <Card>
      <CardHeader eyebrow="Global" title={title} subtitle={subtitle} />
      <div className="flex flex-col gap-1.5 mt-2 max-h-[640px] overflow-y-auto pr-1">
        {items.map((d) => (
          <div key={d.feature} className="flex items-center gap-2.5">
            <div className="w-[190px] text-[12px] text-right truncate shrink-0" style={{ color: "var(--text-secondary)" }} title={humanFeature(d.feature)}>
              {humanFeature(d.feature)}
            </div>
            <div className="flex-1 h-5 rounded relative" style={{ background: "var(--bg-elevated-2)" }}>
              <div
                className="h-full rounded"
                style={{ width: `${(d[valueKey] / max) * 100}%`, background: "var(--accent)", opacity: 0.85 }}
              />
            </div>
            <div className="w-14 text-[11.5px] font-mono shrink-0" style={{ color: "var(--text-tertiary)" }}>
              {d[valueKey].toFixed(4)}
            </div>
            {showDirection && <DirectionTag direction={d.direction} />}
          </div>
        ))}
      </div>
    </Card>
  );
}

function BeeswarmSection({ beeswarm, meanAbsShap, zoomed }) {
  const featureList = useMemo(
    () => meanAbsShap
      .filter((d) => beeswarm[d.feature])
      .map((d) => ({ feature: d.feature, label: humanFeature(d.feature) })),
    [beeswarm, meanAbsShap]
  );
  return (
    <>
      <BeeswarmCanvas beeswarm={beeswarm} features={featureList} height={zoomed ? featureList.length * 36 + 60 : undefined} />
      <div className="flex items-center justify-end gap-2 mt-2 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
        Low feature value
        <div className="w-24 h-2 rounded-full" style={{ background: "linear-gradient(90deg, rgb(79,143,196), rgb(217,90,60))" }} />
        High feature value
      </div>
    </>
  );
}

function DependencePlot({ feature, data, glossaryEntry, zoomed }) {
  const direction = DIRECTION_BADGE[glossaryEntry?.direction] || DIRECTION_BADGE.flat;
  return (
    <Card>
      <div className="flex items-center justify-between mb-1">
        <CardHeader eyebrow="Dependence" title={humanFeature(feature)} />
      </div>
      <DependenceCanvas data={data} height={zoomed ? 480 : 220} />
      {glossaryEntry && (
        <div className="mt-2 pt-2 flex items-center justify-between gap-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{glossaryEntry.description}</p>
          <span className="text-[10px] font-mono shrink-0" style={{ color: direction.color }}>{direction.text}</span>
        </div>
      )}
    </Card>
  );
}

function GlossaryTable({ glossary }) {
  const groups = useMemo(() => {
    const out = {};
    glossary.features.forEach((f) => {
      (out[f.group] ||= []).push(f);
    });
    return out;
  }, [glossary]);

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(groups).map(([group, items]) => (
        <Card key={group}>
          <CardHeader eyebrow="Trained feature group" title={group} />
          <div className="flex flex-col gap-2.5">
            {items.map((f) => (
              <div key={f.feature} className="flex items-start gap-3 py-1.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <div className="w-[180px] shrink-0">
                  <div className="text-[12.5px] font-semibold" style={{ color: "var(--text)" }}>{f.label}</div>
                  {f.one_hot_value && (
                    <div className="text-[10.5px] font-mono mt-0.5" style={{ color: "var(--text-tertiary)" }}>= {f.one_hot_value}</div>
                  )}
                </div>
                <div className="flex-1 text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {f.description}
                </div>
                <DirectionTag direction={f.direction} />
                <div className="w-16 text-right text-[11px] font-mono shrink-0" style={{ color: "var(--text-tertiary)" }}>
                  {f.mean_abs_shap.toFixed(3)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function Explainability() {
  const { data, error, loading } = useApi(() => api.explainability(), []);
  const { data: glossary } = useApi(() => api.featureGlossary(), []);
  const [tab, setTab] = useState("shap");
  const [zoomTarget, setZoomTarget] = useState(null); // { type, feature } | null

  if (loading) return <Loading label="Loading SHAP explanations (4,000-row sample)…" />;
  if (error) return <ErrorBox message={error} />;

  const glossaryByFeature = {};
  (glossary?.features || []).forEach((f) => { glossaryByFeature[f.feature] = f; });

  const meanAbsShapWithDir = data.mean_abs_shap;
  const dependenceEntries = Object.entries(data.dependence).map(([feature, d]) => ({
    feature,
    data: d.feature_value.map((fv, i) => ({ fv, shap: d.shap[i] })),
  }));

  return (
    <div>
      <header className="mb-6">
        <div className="text-[11px] tracking-[0.16em] uppercase font-medium mb-2" style={{ color: "var(--accent)" }}>Interpretability</div>
        <h1 className="text-[26px] font-semibold" style={{ color: "var(--text)" }}>Explainability — SHAP</h1>
        <p className="text-[13.5px] mt-1" style={{ color: "var(--text-secondary)" }}>
          TreeExplainer SHAP values computed on the tuned XGBoost model, sampled across 4,000 test borrowers.
          Every trained feature is listed in the Glossary tab with a plain-English description and its empirical direction of effect.
        </p>
      </header>

      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          ["shap", "Mean |SHAP|"],
          ["gain", "XGBoost gain"],
          ["beeswarm", "Beeswarm"],
          ["dependence", "Dependence plots"],
          ["glossary", "Feature glossary"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="px-3 py-1.5 rounded-lg text-[12.5px] font-medium"
            style={{
              background: tab === id ? "var(--accent-soft)" : "var(--bg-elevated)",
              color: tab === id ? "var(--accent)" : "var(--text-secondary)",
              border: `1px solid ${tab === id ? "var(--accent-border)" : "var(--border)"}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "shap" && (
        <ImportanceBar
          title={`Mean |SHAP value| — all ${meanAbsShapWithDir.length} trained features`}
          subtitle="Average magnitude of each feature's contribution to the predicted default probability"
          items={meanAbsShapWithDir}
          showDirection
        />
      )}
      {tab === "gain" && (
        <ImportanceBar
          title={`XGBoost gain importance — all ${data.gain_importance.length} features`}
          subtitle="Average improvement in split quality contributed by each feature across all trees"
          items={data.gain_importance}
        />
      )}
      {tab === "beeswarm" && (
        <Card>
          <div className="flex items-center justify-between mb-1">
            <CardHeader
              eyebrow="Distribution"
              title="SHAP summary (beeswarm)"
              subtitle="Every dot is one borrower — position shows the SHAP contribution, color shows that borrower's feature value"
            />
            <ZoomButton onClick={() => setZoomTarget({ type: "beeswarm" })} />
          </div>
          <BeeswarmSection beeswarm={data.beeswarm} meanAbsShap={meanAbsShapWithDir} />
        </Card>
      )}
      {tab === "dependence" && (
        <div className="grid md:grid-cols-3 gap-4">
          {dependenceEntries.map(({ feature, data: d }) => (
            <div key={feature} className="relative">
              <div className="absolute top-4 right-4 z-10">
                <ZoomButton onClick={() => setZoomTarget({ type: "dependence", feature })} />
              </div>
              <DependencePlot feature={feature} data={d} glossaryEntry={glossaryByFeature[feature]} />
            </div>
          ))}
        </div>
      )}
      {tab === "glossary" && glossary && <GlossaryTable glossary={glossary} />}
      {tab === "glossary" && !glossary && <Loading label="Loading glossary…" />}

      <Modal
        open={!!zoomTarget}
        onClose={() => setZoomTarget(null)}
        title={zoomTarget?.type === "dependence" ? `${humanFeature(zoomTarget.feature)} — zoomed` : "SHAP summary (beeswarm) — zoomed"}
        width={1100}
      >
        {zoomTarget?.type === "beeswarm" && (
          <BeeswarmSection beeswarm={data.beeswarm} meanAbsShap={meanAbsShapWithDir} zoomed />
        )}
        {zoomTarget?.type === "dependence" && (
          <DependencePlot
            feature={zoomTarget.feature}
            data={dependenceEntries.find((d) => d.feature === zoomTarget.feature)?.data || []}
            glossaryEntry={glossaryByFeature[zoomTarget.feature]}
            zoomed
          />
        )}
      </Modal>
    </div>
  );
}
