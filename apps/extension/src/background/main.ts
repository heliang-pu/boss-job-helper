chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    runtimeState: {
      status: "idle",
      serviceConnected: false,
      todayAppliedCount: 0,
    },
  });
});
