import { describe, expect, it } from "vitest";
import {
  AI_CONFIG_STORAGE_KEY,
  DEFAULT_AI_CONFIG,
  loadAiConfig,
  saveAiConfig,
  type ExtensionStorageArea,
} from "./aiConfigStorage";

class MemoryStorageArea implements ExtensionStorageArea {
  data: Record<string, unknown> = {};

  get(keys: string | string[] | Record<string, unknown> | null, callback: (items: Record<string, unknown>) => void) {
    if (typeof keys === "string") {
      callback({ [keys]: this.data[keys] });
      return;
    }

    if (Array.isArray(keys)) {
      callback(Object.fromEntries(keys.map((key) => [key, this.data[key]])));
      return;
    }

    callback({ ...this.data });
  }

  set(items: Record<string, unknown>, callback?: () => void) {
    this.data = { ...this.data, ...items };
    callback?.();
  }
}

describe("aiConfigStorage", () => {
  it("loads DeepSeek-compatible defaults when nothing is configured", async () => {
    const storage = new MemoryStorageArea();

    await expect(loadAiConfig(storage)).resolves.toEqual(DEFAULT_AI_CONFIG);
  });

  it("saves and reloads AI config without exposing it under unrelated keys", async () => {
    const storage = new MemoryStorageArea();
    const config = {
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-test-secret",
      model: "deepseek-chat",
      timeoutSeconds: 45,
    };

    await saveAiConfig(config, storage);

    expect(storage.data).toEqual({ [AI_CONFIG_STORAGE_KEY]: config });
    await expect(loadAiConfig(storage)).resolves.toEqual(config);
  });
});
