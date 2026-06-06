export function FloatingPanel() {
  return (
    <aside
      style={{
        position: "fixed",
        right: 16,
        top: 96,
        zIndex: 2147483647,
        width: 280,
        boxSizing: "border-box",
        padding: 16,
        background: "#ffffff",
        color: "#111827",
        border: "1px solid #d1d5db",
        borderRadius: 8,
        boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <strong style={{ display: "block", marginBottom: 10, fontSize: 16, lineHeight: 1.4 }}>Boss 求职助手</strong>
      <p style={{ margin: "0 0 12px", color: "#4b5563", fontSize: 14, lineHeight: 1.5 }}>状态：待扫描</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled
          style={{
            minHeight: 34,
            flex: "1 1 0",
            border: "1px solid #cbd5e1",
            borderRadius: 6,
            background: "#e5e7eb",
            color: "#6b7280",
            cursor: "not-allowed",
            font: "inherit",
            fontSize: 14,
          }}
        >
          开始扫描
        </button>
        <button
          type="button"
          disabled
          style={{
            minHeight: 34,
            flex: "0 0 70px",
            border: "1px solid #cbd5e1",
            borderRadius: 6,
            background: "#f3f4f6",
            color: "#6b7280",
            cursor: "not-allowed",
            font: "inherit",
            fontSize: 14,
          }}
        >
          暂停
        </button>
      </div>
    </aside>
  );
}
