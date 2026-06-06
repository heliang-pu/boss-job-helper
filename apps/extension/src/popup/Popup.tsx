export function Popup() {
  return (
    <main
      style={{
        width: 300,
        boxSizing: "border-box",
        padding: 16,
        color: "#111827",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <h1 style={{ margin: "0 0 12px", fontSize: 20, lineHeight: 1.3 }}>Boss 求职助手</h1>
      <p style={{ margin: "0 0 8px", color: "#4b5563", fontSize: 14, lineHeight: 1.5 }}>本地服务：未连接</p>
      <p style={{ margin: "0 0 16px", color: "#4b5563", fontSize: 14, lineHeight: 1.5 }}>今日投递：0</p>
      <button
        type="button"
        disabled
        style={{
          minHeight: 36,
          width: "100%",
          border: "1px solid #cbd5e1",
          borderRadius: 6,
          background: "#f3f4f6",
          color: "#6b7280",
          cursor: "not-allowed",
          font: "inherit",
        }}
      >
        暂停
      </button>
    </main>
  );
}
