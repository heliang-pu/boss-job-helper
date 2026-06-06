import { beforeEach, describe, expect, it } from "vitest";
import { FLOATING_PANEL_CONTAINER_ID, mountFloatingPanel } from "./main";

describe("content floating panel entry", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("does not create duplicate floating panel containers", () => {
    mountFloatingPanel(document);
    mountFloatingPanel(document);

    expect(document.querySelectorAll(`#${FLOATING_PANEL_CONTAINER_ID}`)).toHaveLength(1);
  });
});
