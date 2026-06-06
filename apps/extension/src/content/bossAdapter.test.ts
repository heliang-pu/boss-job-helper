import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BossAdapter } from "./bossAdapter";

const fixtureDir = dirname(fileURLToPath(import.meta.url));

describe("BossAdapter", () => {
  it("extracts job cards from a Boss list page", () => {
    document.body.innerHTML = readFileSync(join(fixtureDir, "fixtures/boss-list.html"), "utf-8");

    const jobs = new BossAdapter(document).extractListJobs();

    expect(jobs).toEqual([
      {
        source: "boss",
        url: "https://www.zhipin.com/job_detail/abc.html",
        title: "机器人软件工程师",
        companyName: "示例科技",
        city: "上海",
        salaryText: "25-40K",
        experienceText: "3-5年",
        educationText: "本科",
        description: "负责 ROS、Python、机器人控制相关开发。",
        bossActiveText: "刚刚活跃",
        publishedText: undefined,
      },
    ]);
  });

  it("skips job cards missing required fields such as the description", () => {
    document.body.innerHTML = `
      <section class="job-card-wrapper">
        <a class="job-card-left" href="/job_detail/missing-desc.html">
          <span class="job-name">机器人软件工程师</span>
          <span class="job-area">上海</span>
          <span class="salary">25-40K</span>
        </a>
        <div class="company-name">示例科技</div>
      </section>
    `;

    const jobs = new BossAdapter(document).extractListJobs();

    expect(jobs).toEqual([]);
  });

  it("skips job cards with a blank link href", () => {
    document.body.innerHTML = `
      <section class="job-card-wrapper">
        <a class="job-card-left" href="   ">
          <span class="job-name">机器人软件工程师</span>
          <span class="job-area">上海</span>
          <span class="salary">25-40K</span>
        </a>
        <div class="company-name">示例科技</div>
        <p class="job-desc">负责 ROS、Python、机器人控制相关开发。</p>
      </section>
    `;

    const jobs = new BossAdapter(document).extractListJobs();

    expect(jobs).toEqual([]);
  });

  it("skips malformed job cards without interrupting valid jobs", () => {
    document.body.innerHTML = `
      <section class="job-card-wrapper">
        <a class="job-card-left" href="javascript:void(0)">
          <span class="job-name">无效链接职位</span>
          <span class="job-area">上海</span>
          <span class="salary">25-40K</span>
        </a>
        <div class="company-name">异常公司</div>
        <ul class="tag-list">
          <li>   </li>
          <li>本科</li>
        </ul>
        <p class="job-desc">这张卡片应该被跳过。</p>
      </section>
      <section class="job-card-wrapper">
        <a class="job-card-left" href="/job_detail/valid.html">
          <span class="job-name">机器人算法工程师</span>
          <span class="job-area">深圳</span>
          <span class="salary">30-50K</span>
        </a>
        <div class="company-name">可靠科技</div>
        <ul class="tag-list">
          <li>   </li>
          <li> </li>
        </ul>
        <p class="job-desc">负责机器人感知与运动规划。</p>
      </section>
    `;

    const jobs = new BossAdapter(document).extractListJobs();

    expect(jobs).toEqual([
      {
        source: "boss",
        url: "https://www.zhipin.com/job_detail/valid.html",
        title: "机器人算法工程师",
        companyName: "可靠科技",
        city: "深圳",
        salaryText: "30-50K",
        experienceText: undefined,
        educationText: undefined,
        description: "负责机器人感知与运动规划。",
        bossActiveText: undefined,
        publishedText: undefined,
      },
    ]);
  });

  it.each([
    ["验证码", "请完成验证码后继续", "遇到验证码或人机验证"],
    ["人机验证", "当前页面需要人机验证", "遇到验证码或人机验证"],
    ["登录扫码", "请登录后使用扫码确认", "登录状态失效"],
    ["账号异常", "账号异常，请稍后再试", "账号异常提示"],
    ["正常页面", "机器人软件工程师 示例科技", null],
  ])("detects blocking condition: %s", (_, pageText, expected) => {
    document.body.innerHTML = `<main>${pageText}</main>`;

    expect(new BossAdapter(document).detectBlockingCondition()).toBe(expected);
  });
});
