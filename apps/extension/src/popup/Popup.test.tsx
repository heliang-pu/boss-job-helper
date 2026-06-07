import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Popup } from "./Popup";
import type { HealthResponse } from "../shared/localApiClient";

describe("Popup", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
  });

  it("shows connected when the local service health check succeeds", async () => {
    const health = vi.fn<() => Promise<HealthResponse>>().mockResolvedValue({
      status: "ok",
      service: "job-apply-assistant-local-service",
    });

    render(<Popup localApi={{ health }} />);

    expect(screen.getByText("本地服务：检测中")).not.toBeNull();

    await waitFor(() => {
      expect(screen.getByText("本地服务：已连接")).not.toBeNull();
    });
    expect(health).toHaveBeenCalledTimes(1);
  });

  it("shows an actionable disconnected state when the local service health check fails", async () => {
    const health = vi.fn<() => Promise<HealthResponse>>().mockRejectedValue(new Error("network down"));

    render(<Popup localApi={{ health }} />);

    await waitFor(() => {
      expect(screen.getByText("本地服务：未连接")).not.toBeNull();
      expect(screen.getByText("请确认本地服务已在 127.0.0.1:8765 启动")).not.toBeNull();
    });
  });
});
