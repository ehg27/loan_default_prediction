import { useEffect } from "react";

export function Modal({ open, onClose, title, children, width = 900 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(5,5,8,0.72)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="card card-solid p-5 max-h-[88vh] overflow-auto"
        style={{ width: "100%", maxWidth: width, border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>{title}</div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[13px]"
            style={{ background: "var(--bg-elevated-2)", color: "var(--text-secondary)" }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ZoomButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] font-medium px-2 py-1 rounded-md flex items-center gap-1"
      style={{ background: "var(--bg-elevated-2)", color: "var(--text-secondary)" }}
      title="Zoom in"
    >
      ⤢ Zoom
    </button>
  );
}
