import { useEffect, useRef } from "react";

function seededJitter(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) - 0.5;
}

function shapColor(t) {
  const low = [79, 143, 196];
  const high = [217, 90, 60];
  const c = low.map((l, i) => Math.round(l + (high[i] - l) * t));
  return `rgba(${c[0]},${c[1]},${c[2]},0.72)`;
}

const LEFT_PAD = 210;
const RIGHT_PAD = 20;
const ROW_HEIGHT = 30;
const TOP_PAD = 16;

// Renders thousands of SHAP points per feature on a single <canvas> — recharts'
// per-point <Cell> React elements were the bottleneck at this data volume (laggy scroll/hover),
// canvas draws them as raw pixels in one pass with no per-point DOM/React cost.
// `features` is [{ feature, label }] — `feature` keys into `beeswarm`, `label` is the
// human-readable name shown (and used as the hover title, in case it's truncated).
export function BeeswarmCanvas({ beeswarm, features, height }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  const chartHeight = height || features.length * ROW_HEIGHT + TOP_PAD + 30;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const width = wrap.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = chartHeight * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${chartHeight}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, chartHeight);

    const plotWidth = width - LEFT_PAD - RIGHT_PAD;

    let maxAbs = 0.001;
    features.forEach(({ feature }) => {
      const shap = beeswarm[feature]?.shap || [];
      shap.forEach((v) => { if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v); });
    });
    const xScale = (v) => LEFT_PAD + plotWidth / 2 + (v / maxAbs) * (plotWidth / 2);

    // gridlines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75].forEach((frac) => {
      const x = LEFT_PAD + plotWidth / 2 + frac * (plotWidth / 2);
      ctx.beginPath();
      ctx.moveTo(x, TOP_PAD - 4);
      ctx.lineTo(x, TOP_PAD + features.length * ROW_HEIGHT + 4);
      ctx.stroke();
    });
    // zero line, stronger
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    const zeroX = xScale(0);
    ctx.beginPath();
    ctx.moveTo(zeroX, TOP_PAD - 4);
    ctx.lineTo(zeroX, TOP_PAD + features.length * ROW_HEIGHT + 4);
    ctx.stroke();

    features.forEach(({ feature }, fi) => {
      const rowY = TOP_PAD + fi * ROW_HEIGHT + ROW_HEIGHT / 2;
      const data = beeswarm[feature];
      if (!data) return;
      const { shap, feature_value_norm } = data;
      for (let i = 0; i < shap.length; i++) {
        const x = xScale(shap[i]);
        const y = rowY + seededJitter(i + fi * 7919) * (ROW_HEIGHT - 8);
        ctx.beginPath();
        ctx.arc(x, y, 2.1, 0, Math.PI * 2);
        ctx.fillStyle = shapColor(feature_value_norm[i]);
        ctx.fill();
      }
    });

    // x-axis ticks
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "center";
    [-1, -0.5, 0, 0.5, 1].forEach((frac) => {
      const v = frac * maxAbs;
      const x = xScale(v);
      ctx.fillText(v.toFixed(2), x, TOP_PAD + features.length * ROW_HEIGHT + 20);
    });
  }, [beeswarm, features, chartHeight]);

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height: chartHeight }}>
      <canvas ref={canvasRef} />
      {/* row labels as real DOM text so they stay crisp + get title tooltips */}
      <div className="absolute top-0 left-0" style={{ paddingTop: TOP_PAD }}>
        {features.map(({ feature, label }, fi) => (
          <div
            key={feature}
            title={label}
            className="text-[11.5px] text-right truncate pr-3"
            style={{
              position: "absolute",
              top: fi * ROW_HEIGHT + ROW_HEIGHT / 2 - 8,
              width: LEFT_PAD - 16,
              color: "var(--text-secondary)",
              height: 16,
              lineHeight: "16px",
            }}
          >
            {label}
          </div>
        ))}
      </div>
      <div
        className="absolute text-[10.5px]"
        style={{ bottom: 0, left: LEFT_PAD, right: RIGHT_PAD, textAlign: "center", color: "var(--text-tertiary)" }}
      >
        SHAP value (impact on default probability)
      </div>
    </div>
  );
}
