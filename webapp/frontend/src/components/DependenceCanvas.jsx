import { useEffect, useRef } from "react";

const LEFT_PAD = 46;
const RIGHT_PAD = 14;
const TOP_PAD = 14;
const BOTTOM_PAD = 30;

// Non-interactive canvas scatter for SHAP dependence plots. Mirrors BeeswarmCanvas's
// approach: recharts' per-point <Scatter> React elements (with a hover <Tooltip>) got
// slow to render/scroll once there were several plots each with thousands of points.
// Canvas draws every point in one pass with no per-point DOM/React/event cost, and
// dropping the tooltip removes the per-point hit-testing that was the other slow part.
export function DependenceCanvas({ data, height = 220 }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !data?.length) return;

    const width = wrap.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const plotWidth = width - LEFT_PAD - RIGHT_PAD;
    const plotHeight = height - TOP_PAD - BOTTOM_PAD;

    let minFv = Infinity, maxFv = -Infinity, maxAbsShap = 0.001;
    for (const { fv, shap } of data) {
      if (fv < minFv) minFv = fv;
      if (fv > maxFv) maxFv = fv;
      if (Math.abs(shap) > maxAbsShap) maxAbsShap = Math.abs(shap);
    }
    if (minFv === maxFv) { minFv -= 1; maxFv += 1; }

    const xScale = (v) => LEFT_PAD + ((v - minFv) / (maxFv - minFv)) * plotWidth;
    const yScale = (v) => TOP_PAD + plotHeight / 2 - (v / maxAbsShap) * (plotHeight / 2);

    // gridlines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach((frac) => {
      const y = TOP_PAD + frac * plotHeight;
      ctx.beginPath();
      ctx.moveTo(LEFT_PAD, y);
      ctx.lineTo(LEFT_PAD + plotWidth, y);
      ctx.stroke();
    });

    // zero line, stronger
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    const zeroY = yScale(0);
    ctx.beginPath();
    ctx.moveTo(LEFT_PAD, zeroY);
    ctx.lineTo(LEFT_PAD + plotWidth, zeroY);
    ctx.stroke();

    // points
    ctx.fillStyle = "rgba(224,164,88,0.55)";
    for (const { fv, shap } of data) {
      ctx.beginPath();
      ctx.arc(xScale(fv), yScale(shap), 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // axis ticks
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "center";
    [0, 0.5, 1].forEach((frac) => {
      const v = minFv + frac * (maxFv - minFv);
      ctx.fillText(v.toFixed(1), LEFT_PAD + frac * plotWidth, height - BOTTOM_PAD + 16);
    });
    ctx.textAlign = "right";
    [-1, 0, 1].forEach((frac) => {
      const v = frac * maxAbsShap;
      ctx.fillText(v.toFixed(2), LEFT_PAD - 8, yScale(v) + 3);
    });
  }, [data, height]);

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
