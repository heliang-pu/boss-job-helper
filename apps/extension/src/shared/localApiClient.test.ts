import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../../manifest.config";
import { checkHealth, LocalApiClient } from "./localApiClient";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const healthyPayload = {
  status: "ok",
  service: "job-apply-assistant-local-service",
} as const;

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

describe("LocalApiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("health() returns the local service payload and calls the exact /health URL", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(healthyPayload));
    const client = new LocalApiClient("http://127.0.0.1:8765", fetchMock);

    await expect(client.health()).resolves.toEqual(healthyPayload);
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8765/health");
  });

  it("health() throws a readable unavailable error when the network rejects", async () => {
    const fetchMock = vi.fn<FetchLike>().mockRejectedValue(new Error("network down"));
    const client = new LocalApiClient("http://127.0.0.1:8765", fetchMock);

    await expect(client.health()).rejects.toThrow("Local service unavailable: network down");
  });

  it("health() throws a readable unavailable error with HTTP status when response is not ok", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(new Response("unavailable", { status: 503, statusText: "Service Unavailable" }));
    const client = new LocalApiClient("http://127.0.0.1:8765", fetchMock);

    await expect(client.health()).rejects.toThrow(
      "Local service unavailable: HTTP 503 Service Unavailable",
    );
  });

  it("health() normalizes a base URL with a trailing slash", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(healthyPayload));
    const client = new LocalApiClient("http://127.0.0.1:8765/", fetchMock);

    await client.health();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8765/health");
  });

  it("checkHealth() falls back to direct fetch when the background receiver is missing", async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(healthyPayload));
    const runtime = {
      lastError: undefined as { message?: string } | undefined,
      sendMessage: vi.fn((_message: unknown, callback: (response?: unknown) => void) => {
        runtime.lastError = { message: "Could not establish connection. Receiving end does not exist." };
        callback(undefined);
        runtime.lastError = undefined;
      }),
    };
    vi.stubGlobal("chrome", { runtime });
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkHealth()).resolves.toEqual(healthyPayload);
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8765/health");
  });
});

describe("extension manifest contract", () => {
  it("declares the expected Manifest V3 permissions and extension surfaces", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe("Boss 求职助手");
    expect(manifest.permissions).toEqual(expect.arrayContaining(["storage", "activeTab", "scripting"]));
    expect(manifest.host_permissions).toEqual(
      expect.arrayContaining([
        "https://www.zhipin.com/*",
        "http://127.0.0.1:8765/*",
        "http://localhost:8765/*",
      ]),
    );
    expect(manifest.host_permissions).not.toContain("http://127.0.0.1/*");
    expect(manifest.host_permissions).not.toContain("http://localhost/*");
    expect(manifest.action.default_popup).toBe("popup.html");
    expect(manifest.background.service_worker).toBe("src/background/main.ts");
    expect(manifest.options_page).toBe("index.html");
  });

  it("registers a Boss content script and scopes local service access to port 8765", () => {
    expect(manifest.content_scripts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          matches: expect.arrayContaining(["https://www.zhipin.com/*"]),
          js: expect.arrayContaining(["src/content/main.tsx"]),
        }),
      ]),
    );
    const localServicePermissions = manifest.host_permissions.filter(
      (permission) => permission.startsWith("http://127.0.0.1") || permission.startsWith("http://localhost"),
    );
    expect(localServicePermissions).toEqual(["http://127.0.0.1:8765/*", "http://localhost:8765/*"]);
  });
});
