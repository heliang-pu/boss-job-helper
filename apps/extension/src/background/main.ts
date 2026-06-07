const BASE_URL = "http://127.0.0.1:8765";

/* ---------- generic fetch helper ---------- */

async function fetcher(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = (body as { detail?: string }).detail ?? `HTTP ${response.status}`;
    return { error: detail };
  }
  return response.json();
}

/* ---------- message handler ---------- */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message as { type?: string; payload?: Record<string, unknown> };

  (async () => {
    try {
      switch (msg.type) {
        case "HEALTH": {
          const result = await fetcher(`${BASE_URL}/health`);
          sendResponse(result);
          break;
        }
        case "MATCH": {
          const result = await fetcher(`${BASE_URL}/match`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(msg.payload),
          });
          sendResponse(result);
          break;
        }
        default:
          sendResponse({ error: `Unknown message type: ${msg.type}` });
      }
    } catch (err) {
      sendResponse({ error: err instanceof Error ? err.message : String(err) });
    }
  })();

  return true; // async
});

/* ---------- install ---------- */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install") return;
  chrome.storage.local.set({ runtimeState: { status: "idle", serviceConnected: false, todayAppliedCount: 0 } });
});

export {};
