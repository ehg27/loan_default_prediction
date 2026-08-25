export function StatTile({ label, value, sub, accent = false }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] tracking-[0.1em] uppercase font-medium" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </div>
      <div
        className="text-2xl font-semibold mt-1.5 font-mono"
        style={{ color: accent ? "var(--accent)" : "var(--text)" }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
