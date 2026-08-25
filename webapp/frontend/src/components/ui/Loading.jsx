export function Loading({ label = "Loading…" }) {
  return (
    <div className="flex items-center gap-2.5 py-16 justify-center" style={{ color: "var(--text-tertiary)" }}>
      <span
        className="inline-block w-3.5 h-3.5 rounded-full border-2 animate-spin"
        style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }}
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBox({ message }) {
  return (
    <div
      className="rounded-xl p-4 text-sm"
      style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", color: "#fca5a5" }}
    >
      {message}
    </div>
  );
}
