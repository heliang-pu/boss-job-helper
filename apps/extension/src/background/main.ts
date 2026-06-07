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
        case "TRUSTED_CLICK": {
          const tabId = _sender.tab?.id;
          if (!tabId) {
            sendResponse({ ok: false, error: "Missing sender tab id" });
            break;
          }
          const x = Number(msg.payload?.x);
          const y = Number(msg.payload?.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            sendResponse({ ok: false, error: "Invalid click coordinates" });
            break;
          }
          await dispatchTrustedClick(tabId, x, y);
          sendResponse({ ok: true });
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

async function dispatchTrustedClick(tabId: number, x: number, y: number): Promise<void> {
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
    });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
  } finally {
    await chrome.debugger.detach(target).catch(() => undefined);
  }
}

/* ---------- install ---------- */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install") return;
  chrome.storage.local.set({ runtimeState: { status: "idle", serviceConnected: false, todayAppliedCount: 0 } });
});

export {};
