chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install") {
    return;
  }

  chrome.storage.local.set({
    runtimeState: {
      status: "idle",
      serviceConnected: false,
      todayAppliedCount: 0,
    },
  });
});

export {};
