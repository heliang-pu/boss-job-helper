import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { AI_CONFIG_STORAGE_KEY, type ExtensionStorageArea } from "../shared/aiConfigStorage";

class MemoryStorageArea implements ExtensionStorageArea {
  data: Record<string, unknown> = {};

  get(keys: string | string[] | Record<string, unknown> | null, callback: (items: Record<string, unknown>) => void) {
    if (typeof keys === "string") {
      callback({ [keys]: this.data[keys] });
      return;
    }

    callback({ ...this.data });
  }

  set(items: Record<string, unknown>, callback?: () => void) {
    this.data = { ...this.data, ...items };
    callback?.();
  }
}

describe("Dashboard App", () => {
  it("renders the MVP configuration sections", async () => {
    render(<App storageArea={new MemoryStorageArea()} />);

    expect(screen.getAllByText("简历").length).toBeGreaterThan(0);
    expect(screen.getAllByText("AI 配置").length).toBeGreaterThan(0);
    expect(screen.getAllByText("求职目标").length).toBeGreaterThan(0);
    expect(screen.getAllByText("投递队列").length).toBeGreaterThan(0);
    expect(screen.getAllByText("日志").length).toBeGreaterThan(0);
    expect(await screen.findByDisplayValue("https://api.deepseek.com")).not.toBeNull();
  });

  it("saves AI configuration to extension local storage", async () => {
    const storage = new MemoryStorageArea();
    render(<App storageArea={storage} />);

    expect(await screen.findByDisplayValue("https://api.deepseek.com")).not.toBeNull();
    const apiKeyInput = screen.getByLabelText("API Key") as HTMLInputElement;
    expect(apiKeyInput.type).toBe("password");

    fireEvent.change(apiKeyInput, { target: { value: "sk-test-secret" } });
    fireEvent.change(screen.getByLabelText("模型"), { target: { value: "deepseek-reasoner" } });
    fireEvent.click(screen.getByRole("button", { name: "保存 AI 配置" }));

    await waitFor(() => {
      expect(storage.data[AI_CONFIG_STORAGE_KEY]).toEqual({
        baseUrl: "https://api.deepseek.com",
        apiKey: "sk-test-secret",
        model: "deepseek-reasoner",
        timeoutSeconds: 30,
      });
    });
  });
});
