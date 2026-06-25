import { useEffect, useRef, useState } from "react";
import type { ResumeProfile, SearchPreference } from "@job-apply-assistant/shared-schema";
import { checkHealth, uploadResume, BASE_URL, type HealthResponse } from "../shared/localApiClient";
import { DEFAULT_AI_CONFIG, loadAiConfig, saveAiConfig } from "../shared/aiConfigStorage";

/* ---------- storage helpers ---------- */

const RESUME_KEY = "resumeProfile";

async function loadResume(): Promise<ResumeProfile | null> {
  const items = await chrome.storage.local.get(RESUME_KEY);
  const raw = items[RESUME_KEY];
  if (raw && typeof raw === "object" && (raw as Record<string, unknown>).id) {
    return raw as ResumeProfile;
  }
  return null;
}

async function saveResume(profile: ResumeProfile) {
  await chrome.storage.local.set({ [RESUME_KEY]: profile });
}

/* ---------- component ---------- */

type ServiceStatus = "checking" | "connected" | "disconnected";

export interface PopupProps {
  localApi?: {
    health: () => Promise<HealthResponse>;
    uploadResume?: (file: File) => Promise<ResumeProfile>;
  };
}

const defaultLocalApi = {
  health: checkHealth,
  uploadResume: (file: File) => uploadResume(file) as Promise<ResumeProfile>,
};

export function Popup({ localApi = defaultLocalApi }: PopupProps) {
  const [status, setStatus] = useState<ServiceStatus>("checking");
  const [error, setError] = useState<string | null>(null);

  const [baseUrl, setBaseUrl] = useState(DEFAULT_AI_CONFIG.baseUrl);
  const [apiKey, setApiKey] = useState(DEFAULT_AI_CONFIG.apiKey);
  const [model, setModel] = useState(DEFAULT_AI_CONFIG.model);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  const [resume, setResume] = useState<ResumeProfile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // init
  useEffect(() => {
    let canceled = false;

    localApi
      .health()
      .then(() => {
        if (canceled) return;
        setStatus("connected");
        setError(null);
      })
      .catch((err) => {
        if (canceled) return;
        setStatus("disconnected");
        setError(err instanceof Error ? err.message : String(err));
      });
    loadAiConfig().then((cfg) => {
      if (canceled) return;
      setBaseUrl(cfg.baseUrl);
      setApiKey(cfg.apiKey);
      setModel(cfg.model);
    });
    loadResume().then((profile) => {
      if (canceled) return;
      setResume(profile);
    });

    return () => {
      canceled = true;
    };
  }, [localApi]);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    await saveAiConfig({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim(), timeoutSeconds: 30 });
    setSavingConfig(false);
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 1500);
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const profile = await (localApi.uploadResume ? localApi.uploadResume(file) : uploadResume(file) as Promise<ResumeProfile>);
      await saveResume(profile as unknown as ResumeProfile);
      setResume(profile as unknown as ResumeProfile);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const aiConfigured = baseUrl.trim() && apiKey.trim() && model.trim();
  const ready = status === "connected" && aiConfigured && resume !== null;

  const s = (style: React.CSSProperties) => style;
  const inputS = s({ width: "100%", boxSizing: "border-box", padding: "6px 8px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 4, marginBottom: 6 });
  const labelS = s({ display: "block", marginBottom: 2, fontSize: 12, fontWeight: 600, color: "#374151" });

  return (
    <main style={{ width: 340, boxSizing: "border-box", padding: 16, fontFamily: "system-ui, -apple-system, sans-serif", color: "#111827", fontSize: 13 }}>
      <h1 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 700 }}>Boss 求职助手</h1>

      <div style={{ marginBottom: 10 }}>
        {status === "checking" && <span style={{ color: "#6b7280" }}>本地服务：检测中</span>}
        {status === "connected" && <span style={{ color: "#059669" }}>本地服务：已连接</span>}
        {status === "disconnected" && (
          <>
            <span style={{ color: "#dc2626" }}>本地服务：未连接</span>
            <div style={{ marginTop: 4, color: "#6b7280", fontSize: 12 }}>
              请确认本地服务已在 127.0.0.1:8765 启动
            </div>
            {error && <div style={{ marginTop: 4, color: "#9ca3af", fontSize: 12 }}>{error}</div>}
          </>
        )}
      </div>

      <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "10px 0" }} />

      <details open={!aiConfigured} style={{ marginBottom: 8 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
          🤖 AI 配置 {aiConfigured ? "✅" : "⚠️"}
        </summary>
        <label style={labelS}>Base URL</label>
        <input style={inputS} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com" />
        <label style={labelS}>API Key</label>
        <input style={inputS} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
        <label style={labelS}>Model</label>
        <input style={inputS} value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-chat" />
        <button
          type="button"
          disabled={savingConfig || !baseUrl.trim() || !apiKey.trim() || !model.trim()}
          onClick={handleSaveConfig}
          style={{
            minHeight: 32, width: "100%", borderRadius: 5, border: "1px solid #0891b2",
            background: configSaved ? "#065f46" : "#0891b2", color: "#fff",
            cursor: configSaved ? "default" : "pointer", fontWeight: 600, fontSize: 13,
          }}
        >
          {configSaved ? "已保存 ✅" : savingConfig ? "保存中…" : "保存配置"}
        </button>
      </details>

      <details open={resume === null} style={{ marginBottom: 8 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
          📄 简历 {resume ? "✅" : "⚠️"}
        </summary>
        {resume ? (
          <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, marginBottom: 6 }}>
            <div>📎 {resume.fileName}</div>
            <div>🛠 技能：{(resume.skills ?? []).join("、") || "未识别"}</div>
            <div>🎓 学历：{(resume.education ?? []).join("、") || "未识别"}</div>
            <div>🎯 推荐角色：{(resume.targetRoleSuggestions ?? []).join("、")}</div>
          </div>
        ) : (
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#6b7280" }}>请上传 PDF 或 DOCX 简历</p>
        )}
        <input ref={fileRef} type="file" accept=".pdf,.docx" onChange={handleResumeUpload} style={{ display: "none" }} />
        <button
          type="button"
          disabled={uploading || status !== "connected"}
          onClick={() => fileRef.current?.click()}
          style={{
            minHeight: 28, width: "100%", borderRadius: 5, border: "1px solid #d1d5db",
            background: uploading ? "#f3f4f6" : "#f9fafb", color: "#111827",
            cursor: uploading ? "wait" : "pointer", fontSize: 12,
          }}
        >
          {uploading ? "上传中…" : resume ? "重新上传" : "选择简历文件"}
        </button>
        {uploadError && <p style={{ color: "#dc2626", fontSize: 12, margin: "4px 0 0" }}>{uploadError}</p>}
      </details>

      <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "10px 0" }} />

      <div style={{ marginBottom: 10, fontSize: 12, color: "#6b7280" }}>
        <div>今日投递：0</div>
        <div>服务地址：{BASE_URL}</div>
      </div>

      <div style={{
        padding: "8px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600, textAlign: "center",
        background: ready ? "#ecfdf5" : "#fef2f2",
        color: ready ? "#065f46" : "#991b1b",
        border: `1px solid ${ready ? "#a7f3d0" : "#fecaca"}`,
      }}>
        {!ready
          ? "⚠️ 请确保：服务已连接 + AI 已配置 + 简历已上传"
          : "✅ 一切就绪，打开 Boss 直聘搜索页开始扫描"}
      </div>
    </main>
  );
}
