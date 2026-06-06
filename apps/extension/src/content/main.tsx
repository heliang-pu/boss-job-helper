import { createRoot } from "react-dom/client";
import { FloatingPanel } from "./FloatingPanel";

const container = document.createElement("div");
container.id = "job-apply-assistant-floating-panel";
document.body.appendChild(container);

createRoot(container).render(<FloatingPanel />);
