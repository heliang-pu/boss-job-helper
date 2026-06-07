import { FormEvent, useEffect, useState } from "react";
import {
  DEFAULT_AI_CONFIG,
  loadAiConfig,
  saveAiConfig,
  type AiConfig,
  type ExtensionStorageArea,
} from "../shared/aiConfigStorage";

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

export interface AppProps {
  storageArea?: ExtensionStorageArea;
}

export function App({ storageArea }: AppProps) {
  const [aiConfig, setAiConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    let isMounted = true;
    loadAiConfig(storageArea)
      .then((storedConfig) => {
        if (isMounted) setAiConfig(storedConfig);
      })
      .catch(() => {
        if (isMounted) setSaveStatus("error");
      });

    return () => {
      isMounted = false;
    };
  }, [storageArea]);

  async function handleAiConfigSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveStatus("idle");

    try {
      await saveAiConfig(aiConfig, storageArea);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }

  function updateAiConfig<K extends keyof AiConfig>(key: K, value: AiConfig[K]) {
    setAiConfig((current) => ({ ...current, [key]: value }));
  }

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

        <section
          aria-labelledby="ai-config-title"
          style={{
            marginTop: 20,
            padding: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#ffffff",
            boxSizing: "border-box",
          }}
        >
          <h2 id="ai-config-title" style={{ margin: 0, fontSize: 18, lineHeight: 1.35 }}>
            AI 配置
          </h2>
          <form
            onSubmit={handleAiConfigSubmit}
            style={{
              display: "grid",
              gap: 12,
              marginTop: 14,
              maxWidth: 720,
            }}
          >
            <label style={{ display: "grid", gap: 6, color: "#111827", fontSize: 14 }}>
              请求地址
              <input
                value={aiConfig.baseUrl}
                onChange={(event) => updateAiConfig("baseUrl", event.target.value)}
                style={inputStyle}
                autoComplete="off"
              />
            </label>
            <label style={{ display: "grid", gap: 6, color: "#111827", fontSize: 14 }}>
              模型
              <input
                value={aiConfig.model}
                onChange={(event) => updateAiConfig("model", event.target.value)}
                style={inputStyle}
                autoComplete="off"
              />
            </label>
            <label style={{ display: "grid", gap: 6, color: "#111827", fontSize: 14 }}>
              API Key
              <input
                type="password"
                value={aiConfig.apiKey}
                onChange={(event) => updateAiConfig("apiKey", event.target.value)}
                style={inputStyle}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <button
              type="submit"
              style={{
                minHeight: 38,
                width: "fit-content",
                padding: "0 14px",
                border: "1px solid #0891b2",
                borderRadius: 6,
                background: "#0891b2",
                color: "#ffffff",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              保存 AI 配置
            </button>
            {saveStatus === "saved" ? (
              <p role="status" style={{ margin: 0, color: "#047857", fontSize: 14 }}>
                AI 配置已保存到本地扩展存储。
              </p>
            ) : null}
            {saveStatus === "error" ? (
              <p role="alert" style={{ margin: 0, color: "#b91c1c", fontSize: 14 }}>
                无法读写扩展存储，请重新加载扩展后再试。
              </p>
            ) : null}
          </form>
        </section>
      </div>
    </main>
  );
}

const inputStyle = {
  minHeight: 38,
  padding: "0 10px",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  color: "#111827",
  font: "inherit",
  boxSizing: "border-box",
} satisfies React.CSSProperties;
