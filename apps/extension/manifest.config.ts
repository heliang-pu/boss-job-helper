import type { ManifestV3Export } from "@crxjs/vite-plugin";

const manifest = {
  manifest_version: 3,
  name: "Boss 求职助手",
  version: "0.1.0",
  description: "连接本地求职自动化服务，在 Boss 直聘页面辅助匹配和投递岗位。",
  permissions: ["storage", "activeTab", "scripting"],
  host_permissions: ["https://www.zhipin.com/*", "http://127.0.0.1:8765/*", "http://localhost:8765/*"],
  action: {
    default_popup: "index.html",
  },
  background: {
    service_worker: "src/background/main.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["https://www.zhipin.com/*"],
      js: ["src/content/main.tsx"],
      run_at: "document_idle",
    },
  ],
  options_page: "index.html",
} as const satisfies ManifestV3Export;

export default manifest;
