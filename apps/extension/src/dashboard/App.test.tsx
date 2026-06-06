import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("Dashboard App", () => {
  it("renders the MVP configuration sections", () => {
    render(<App />);

    expect(screen.getAllByText("简历").length).toBeGreaterThan(0);
    expect(screen.getAllByText("AI 配置").length).toBeGreaterThan(0);
    expect(screen.getAllByText("求职目标").length).toBeGreaterThan(0);
    expect(screen.getAllByText("投递队列").length).toBeGreaterThan(0);
    expect(screen.getAllByText("日志").length).toBeGreaterThan(0);
  });
});
