import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingPanel } from "./FloatingPanel";

describe("FloatingPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
        },
        session: {
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
      runtime: {
        lastError: undefined,
        sendMessage: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("enables start scan from the idle state", () => {
    render(<FloatingPanel />);

    const startButton = screen.getByRole("button", { name: "开始扫描" });
    expect(startButton).not.toHaveProperty("disabled", true);
    expect(screen.getByText("就绪，点击扫描当前页岗位")).not.toBeNull();
  });

  it("shows a configuration error when AI config is missing", async () => {
    render(<FloatingPanel />);

    fireEvent.click(screen.getByRole("button", { name: "开始扫描" }));

    await waitFor(() => {
      expect(screen.getByText("请先在扩展弹窗中配置 AI（baseUrl / apiKey / model）")).not.toBeNull();
    });
  });

  it("explains that the Boss page must be refreshed after the extension context is invalidated", async () => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockRejectedValue(new Error("Extension context invalidated.")),
        },
      },
    });
    render(<FloatingPanel />);

    fireEvent.click(screen.getByRole("button", { name: "开始扫描" }));

    await waitFor(() => {
      expect(screen.getByText("扩展刚刚更新，请刷新当前 Boss 页面后再扫描")).not.toBeNull();
    });
  });

  it("opens the selected job and stores the pending apply task when applying", async () => {
    document.body.innerHTML = `
      <section class="job-card-box">
        <a href="/job_detail/apply-one.html">
          <span class="job-name">具身VLA算法工程师</span>
          <span class="salary">30-45K·15薪</span>
          <span class="job-area">上海</span>
          <span class="company-name">人形机器人</span>
        </a>
      </section>
    `;
    const sessionSet = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn((_message: unknown, callback: (response?: unknown) => void) => {
      callback({
        passedHardFilters: true,
        hardFilterReasons: [],
        score: 85,
        reasons: ["匹配"],
        risks: [],
        greeting: "您好，期待沟通。",
        shouldQueue: true,
      });
    });
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            aiConfig: { baseUrl: "https://api.deepseek.com", apiKey: "sk-test", model: "deepseek-chat" },
            resumeProfile: {
              id: "resume-1",
              fileName: "resume.pdf",
              rawText: "机器人项目",
              summary: "机器人",
              skills: ["机器人"],
              yearsOfExperience: 1,
              projectHighlights: [],
              education: ["本科"],
              targetRoleSuggestions: ["算法工程师"],
            },
          }),
        },
        session: {
          set: sessionSet,
        },
      },
      runtime: {
        lastError: undefined,
        sendMessage,
      },
    });
    const open = vi.fn().mockReturnValue({});
    vi.stubGlobal("open", open);

    render(<FloatingPanel />);
    fireEvent.click(screen.getByRole("button", { name: "开始扫描" }));
    await screen.findByText("立即投递 →");

    fireEvent.click(screen.getByRole("button", { name: "立即投递 →" }));

    await waitFor(() => {
      expect(open).toHaveBeenCalledWith("https://www.zhipin.com/job_detail/apply-one.html", "_blank");
      expect(sessionSet).toHaveBeenCalledWith({
        pendingApplyTask: expect.objectContaining({
          jobUrl: "https://www.zhipin.com/job_detail/apply-one.html",
          greeting: "您好，期待沟通。",
          companyName: "人形机器人",
          title: "具身VLA算法工程师",
        }),
        pendingApplyTasks: [
          expect.objectContaining({
            jobUrl: "https://www.zhipin.com/job_detail/apply-one.html",
            greeting: "您好，期待沟通。",
            companyName: "人形机器人",
            title: "具身VLA算法工程师",
          }),
        ],
      });
      expect(sessionSet.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0]);
    });
  });

  it("opens only the first queued job and stores batch apply tasks when applying all", async () => {
    document.body.innerHTML = `
      <section class="job-card-box">
        <a href="/job_detail/apply-one.html">
          <span class="job-name">具身VLA算法工程师</span>
          <span class="salary">30-45K·15薪</span>
          <span class="job-area">上海</span>
          <span class="company-name">人形机器人</span>
        </a>
      </section>
      <section class="job-card-box">
        <a href="/job_detail/apply-two.html">
          <span class="job-name">机器人软件工程师</span>
          <span class="salary">25-35K</span>
          <span class="job-area">上海</span>
          <span class="company-name">智能科技</span>
        </a>
      </section>
    `;
    const sessionSet = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn((_message: unknown, callback: (response?: unknown) => void) => {
      callback({
        passedHardFilters: true,
        hardFilterReasons: [],
        score: 85,
        reasons: ["匹配"],
        risks: [],
        greeting: "您好，期待沟通。",
        shouldQueue: true,
      });
    });
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            aiConfig: { baseUrl: "https://api.deepseek.com", apiKey: "sk-test", model: "deepseek-chat" },
            resumeProfile: {
              id: "resume-1",
              fileName: "resume.pdf",
              rawText: "机器人项目",
              summary: "机器人",
              skills: ["机器人"],
              yearsOfExperience: 1,
              projectHighlights: [],
              education: ["本科"],
              targetRoleSuggestions: ["算法工程师"],
            },
          }),
        },
        session: {
          set: sessionSet,
        },
      },
      runtime: {
        lastError: undefined,
        sendMessage,
      },
    });
    const open = vi.fn().mockReturnValue({});
    vi.stubGlobal("open", open);

    render(<FloatingPanel />);
    fireEvent.click(screen.getByRole("button", { name: "开始扫描" }));
    await screen.findByRole("button", { name: "一键投递（2）" });

    fireEvent.click(screen.getByRole("button", { name: "一键投递（2）" }));

    await waitFor(() => {
      expect(open).toHaveBeenCalledTimes(1);
      expect(open).toHaveBeenCalledWith("https://www.zhipin.com/job_detail/apply-one.html", "_blank");
      expect(sessionSet).toHaveBeenCalledWith({
        pendingApplyTask: expect.objectContaining({
          jobUrl: "https://www.zhipin.com/job_detail/apply-one.html",
        }),
        pendingApplyTasks: [
          expect.objectContaining({ jobUrl: "https://www.zhipin.com/job_detail/apply-one.html" }),
          expect.objectContaining({ jobUrl: "https://www.zhipin.com/job_detail/apply-two.html" }),
        ],
      });
      expect(sessionSet.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0]);
    });
  });
});
