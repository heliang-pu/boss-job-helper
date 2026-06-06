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
});
