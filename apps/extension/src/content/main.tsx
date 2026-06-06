import { createRoot } from "react-dom/client";
import { FloatingPanel } from "./FloatingPanel";

export const FLOATING_PANEL_CONTAINER_ID = "job-apply-assistant-floating-panel";

export function mountFloatingPanel(doc: Document = document) {
  if (doc.getElementById(FLOATING_PANEL_CONTAINER_ID)) {
    return;
  }

  const container = doc.createElement("div");
  container.id = FLOATING_PANEL_CONTAINER_ID;
  doc.body.appendChild(container);

  createRoot(container).render(<FloatingPanel />);
}

mountFloatingPanel();
