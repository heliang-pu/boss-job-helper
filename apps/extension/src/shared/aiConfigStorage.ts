export const AI_CONFIG_STORAGE_KEY = "aiConfig";

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutSeconds: number;
}

export interface ExtensionStorageArea {
  get(
    keys: string | string[] | Record<string, unknown> | null,
    callback: (items: Record<string, unknown>) => void,
  ): void | Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>, callback?: () => void): void | Promise<void>;
}

const envAiBaseUrl = import.meta.env.VITE_AI_BASE_URL?.trim();
const envAiApiKey = import.meta.env.VITE_AI_API_KEY?.trim();
const envAiModel = import.meta.env.VITE_AI_MODEL?.trim();

export const DEFAULT_AI_CONFIG: AiConfig = {
  baseUrl: envAiBaseUrl || "https://api.deepseek.com",
  apiKey: envAiApiKey || "",
  model: envAiModel || "deepseek-chat",
  timeoutSeconds: 30,
};

export async function loadAiConfig(storageArea: ExtensionStorageArea = chrome.storage.local): Promise<AiConfig> {
  const items = await getStorageItems(storageArea, AI_CONFIG_STORAGE_KEY);
  return normalizeAiConfig(items[AI_CONFIG_STORAGE_KEY]);
}

export async function saveAiConfig(
  config: AiConfig,
  storageArea: ExtensionStorageArea = chrome.storage.local,
): Promise<void> {
  await setStorageItems(storageArea, {
    [AI_CONFIG_STORAGE_KEY]: normalizeAiConfig(config),
  });
}

function normalizeAiConfig(value: unknown): AiConfig {
  if (!isRecord(value)) {
    return DEFAULT_AI_CONFIG;
  }

  return {
    baseUrl: normalizeString(value.baseUrl, DEFAULT_AI_CONFIG.baseUrl),
    apiKey: normalizeString(value.apiKey, DEFAULT_AI_CONFIG.apiKey),
    model: normalizeString(value.model, DEFAULT_AI_CONFIG.model),
    timeoutSeconds: normalizeTimeout(value.timeoutSeconds),
  };
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeTimeout(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : DEFAULT_AI_CONFIG.timeoutSeconds;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStorageItems(storageArea: ExtensionStorageArea, key: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let callbackResolved = false;
    try {
      const maybePromise = storageArea.get(key, (items) => {
        callbackResolved = true;
        resolve(items);
      });
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then((items) => {
          if (!callbackResolved) resolve(items);
        }, reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function setStorageItems(storageArea: ExtensionStorageArea, items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    let callbackResolved = false;
    try {
      const maybePromise = storageArea.set(items, () => {
        callbackResolved = true;
        resolve();
      });
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(() => {
          if (!callbackResolved) resolve();
        }, reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}
