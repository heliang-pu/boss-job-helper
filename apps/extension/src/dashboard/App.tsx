const sections = [
  {
    title: "简历",
    description: "导入 PDF/DOCX 简历，解析后用于岗位匹配。",
  },
  {
    title: "AI 配置",
    description: "配置 OpenAI-compatible base_url、api_key 和 model。",
  },
  {
    title: "求职目标",
    description: "确认城市、薪资、关键词、黑名单和投递节奏。",
  },
  {
    title: "投递队列",
    description: "查看待投递、已投递、需人工处理和失败任务。",
  },
  {
    title: "日志",
    description: "查看匹配原因、过滤原因、异常原因和暂停记录。",
  },
];

export function App() {
  return (
    <main
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        background: "#f8fafc",
        color: "#111827",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.25 }}>Boss 求职助手</h1>
          <p style={{ margin: "8px 0 0", color: "#4b5563", lineHeight: 1.6 }}>
            配置简历、AI、求职目标，并查看投递队列与运行日志。
          </p>
        </header>

        <nav
          aria-label="配置分区"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 20,
          }}
        >
          {sections.map((section) => (
            <button
              key={section.title}
              type="button"
              style={{
                minHeight: 36,
                padding: "0 12px",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                background: "#ffffff",
                color: "#111827",
                font: "inherit",
                cursor: "default",
                whiteSpace: "nowrap",
              }}
            >
              {section.title}
            </button>
          ))}
        </nav>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {sections.map((section) => (
            <section
              key={section.title}
              style={{
                minHeight: 112,
                padding: 16,
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                background: "#ffffff",
                boxSizing: "border-box",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.35 }}>{section.title}</h2>
              <p style={{ margin: "8px 0 0", color: "#4b5563", lineHeight: 1.6 }}>{section.description}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
