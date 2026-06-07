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
        publishedText: "今日发布",
      },
    ]);
  });

  it("skips job cards missing required fields such as the salary", () => {
    document.body.innerHTML = `
      <section class="job-card-wrapper">
        <a class="job-card-left" href="/job_detail/missing-salary.html">
          <span class="job-name">机器人软件工程师</span>
          <span class="job-area">上海</span>
        </a>
        <div class="company-name">示例科技</div>
      </section>
    `;

    const jobs = new BossAdapter(document).extractListJobs();

    expect(jobs).toEqual([]);
  });

  it("extracts modern Boss job cards without a dedicated description node", () => {
    document.body.innerHTML = `
      <section class="job-card-box">
        <a class="job-card-left" href="/job_detail/vla.html">
          <span class="job-name">具身VLA算法工程师</span>
          <span class="job-area">上海</span>
          <span class="salary">30-45K·15薪</span>
        </a>
        <div class="company-name">人形机器人</div>
        <ul class="tag-list">
          <li>1-3年</li>
          <li>硕士</li>
        </ul>
      </section>
    `;

    const jobs = new BossAdapter(document).extractListJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: "boss",
      url: "https://www.zhipin.com/job_detail/vla.html",
      title: "具身VLA算法工程师",
      companyName: "人形机器人",
      city: "上海",
      salaryText: "30-45K·15薪",
      experienceText: "1-3年",
      educationText: "硕士",
    });
  });

  it("extracts redesigned Boss search cards from job detail links when class names change", () => {
    document.body.innerHTML = `
      <main>
        <div class="search-result-panel">
          <article class="list-item-current">
            <a class="primary-link" href="/job_detail/new-vla.html">
              <span class="position-title">具身VLA算法工程师(人形机器人)</span>
            </a>
            <strong class="pay-text">30-45K·15薪</strong>
            <span class="work-city">上海</span>
            <span class="requirement">1-3年</span>
            <span class="requirement">硕士</span>
            <div class="brand-row">
              <span class="brand-name">人形机器人</span>
            </div>
          </article>
        </div>
        <section class="job-detail">
          <h2>职位描述</h2>
          <p>负责具身智能 VLA 模型训练与部署。</p>
        </section>
      </main>
    `;

    const adapter = new BossAdapter(document);
    const jobs = adapter.extractListJobs();

    expect(adapter.detectBlockingCondition()).toBeNull();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: "boss",
      url: "https://www.zhipin.com/job_detail/new-vla.html",
      title: "具身VLA算法工程师(人形机器人)",
      companyName: "人形机器人",
      city: "上海",
      salaryText: "30-45K·15薪",
      publishedText: "今日发布",
    });
  });

  it("cleans salary text polluted by icon-font characters", () => {
    document.body.innerHTML = `
      <article class="list-item-current">
        <a class="primary-link" href="/job_detail/icon-font-salary.html">
          <span class="position-title">具身智能算法工程师</span>
        </a>
        <strong class="pay-text">薪资：█30-45K·15薪█</strong>
        <span class="work-city">上海</span>
        <span class="brand-name">机器人公司</span>
      </article>
    `;

    const jobs = new BossAdapter(document).extractListJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0].salaryText).toBe("30-45K·15薪");
    expect(jobs[0].publishedText).toBe("今日发布");
  });

  it("detects job cards when the matching element is itself the job detail link", () => {
    document.body.innerHTML = `
      <a class="job-card-box" href="/job_detail/self-link.html">
        <span class="job-name">具身智能后端开发</span>
        <span class="salary">25-40K·15薪</span>
        <span class="job-area">上海</span>
        <span class="company-name">上海具身智能设备</span>
      </a>
    `;

    const adapter = new BossAdapter(document);
    const jobs = adapter.extractListJobs();

    expect(adapter.detectBlockingCondition()).toBeNull();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      url: "https://www.zhipin.com/job_detail/self-link.html",
      title: "具身智能后端开发",
      companyName: "上海具身智能设备",
      salaryText: "25-40K·15薪",
      city: "上海",
    });
  });

  it("extracts visible Boss cards when title and company use unstable class names", () => {
    document.body.innerHTML = `
      <section class="job-card-box">
        <a href="/job_detail/current-boss.html">
          <div class="name">博士招聘-研发技术专家（AI方向）</div>
          <div class="money">40-50K·15薪</div>
          <div class="labels">经验不限 博士</div>
          <div class="org">上海具身智能设备</div>
          <div class="place">上海 静安区 汶水路</div>
        </a>
      </section>
    `;

    const adapter = new BossAdapter(document);
    const jobs = adapter.extractListJobs();

    expect(adapter.detectBlockingCondition()).toBeNull();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      url: "https://www.zhipin.com/job_detail/current-boss.html",
      title: "博士招聘-研发技术专家（AI方向）",
      companyName: "上海具身智能设备",
      city: "上海",
      salaryText: "40-50K·15薪",
    });
  });

  it("extracts Luoyang job cards from the left search result list", () => {
    document.body.innerHTML = `
      <main>
        <section class="job-card-box">
          <a href="/job_detail/luoyang-one.html">
            <div class="job-title">运营专员</div>
            <div class="salary">3-5K</div>
            <div class="tags">1-3年 大专</div>
            <div class="company-name">洛阳弘善中医门诊部</div>
            <div class="job-area">洛阳</div>
          </a>
        </section>
        <section class="job-card-box">
          <a href="/job_detail/luoyang-two.html">
            <div class="job-title">客服专员/运营助理</div>
            <div class="salary">4-9K</div>
            <div class="tags">经验不限 大专</div>
            <div class="company-name">洛阳易家达</div>
            <div class="job-area">洛阳</div>
          </a>
        </section>
        <section class="job-detail">
          <h1>运营岗/包吃住/接受小白/带薪刷手机</h1>
        </section>
      </main>
    `;

    const adapter = new BossAdapter(document);
    const jobs = adapter.extractListJobs();

    expect(adapter.detectBlockingCondition()).toBeNull();
    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.title)).toEqual(["运营专员", "客服专员/运营助理"]);
    expect(jobs.map((job) => job.city)).toEqual(["洛阳", "洛阳"]);
  });

  it("decodes Boss private-font salary digits from real search cards", () => {
    document.body.innerHTML = `
      <section class="job-card-box">
        <a href="/job_detail/private-font.html">
          <div class="name">博士招聘-研发技术专家（AI方向）</div>
          <div class="money">-K·薪</div>
          <div class="labels">经验不限 博士</div>
          <div class="org">上海具身智能设备</div>
          <div class="place">上海·静安区·汶水路</div>
        </a>
      </section>
    `;

    const jobs = new BossAdapter(document).extractListJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: "博士招聘-研发技术专家（AI方向）",
      salaryText: "40-50K·15薪",
      companyName: "上海具身智能设备",
      city: "上海",
    });
  });

  it("does not treat logged-in job pages with WeChat scan sharing text as expired login", () => {
    document.body.innerHTML = `
      <main>
        <a class="job-card-left" href="/job_detail/vla.html">
          <span class="job-name">VLM/VLA 大模型算法工程师</span>
          <span class="job-area">上海</span>
          <span class="salary">40-70K·15薪</span>
        </a>
        <section class="job-card-box">
          <a class="job-card-left" href="/job_detail/vla.html">
            <span class="job-name">VLM/VLA 大模型算法工程师</span>
            <span class="job-area">上海</span>
            <span class="salary">40-70K·15薪</span>
          </a>
          <div class="company-name">小鹏汽车</div>
          <ul class="tag-list">
            <li>经验不限</li>
            <li>硕士</li>
          </ul>
        </section>
        <a>微信扫码分享</a>
        <a>登录帮助</a>
        <a>蒲贺良</a>
      </main>
    `;

    expect(new BossAdapter(document).detectBlockingCondition()).toBeNull();
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
        publishedText: "今日发布",
      },
    ]);
  });

  it("skips external absolute job card links without interrupting valid jobs", () => {
    document.body.innerHTML = `
      <section class="job-card-wrapper">
        <a class="job-card-left" href="https://evil.example/job_detail/external.html">
          <span class="job-name">外部链接职位</span>
          <span class="job-area">上海</span>
          <span class="salary">25-40K</span>
        </a>
        <div class="company-name">异常公司</div>
        <ul class="tag-list">
          <li>3-5年</li>
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
        publishedText: "今日发布",
      },
    ]);
  });

  it.each([
    ["验证码", "请完成验证码后继续", "遇到验证码或人机验证"],
    ["人机验证", "当前页面需要人机验证", "遇到验证码或人机验证"],
    ["扫码登录", "请扫码登录后继续", "登录状态失效"],
    ["账号异常", "账号异常，请稍后再试", "账号异常提示"],
  ])("detects blocking condition: %s", (_, pageText, expected) => {
    document.body.innerHTML = `<main>${pageText}</main>`;

    expect(new BossAdapter(document).detectBlockingCondition()).toBe(expected);
  });

  it.each(["请先登录", "登录后查看", "未登录"])("treats login prompt as an expired login: %s", (pageText) => {
    document.body.innerHTML = `<main>${pageText}</main>`;

    expect(new BossAdapter(document).detectBlockingCondition()).toBe("登录状态失效");
  });

  it("pauses on non-empty unknown dialogs", () => {
    document.body.innerHTML = `
      <main>
        <section class="job-card-wrapper">
          <a class="job-card-left" href="/job_detail/abc.html">
            <span class="job-name">机器人软件工程师</span>
            <span class="job-area">上海</span>
            <span class="salary">25-40K</span>
          </a>
          <div class="company-name">示例科技</div>
          <p class="job-desc">负责 ROS、Python、机器人控制相关开发。</p>
        </section>
        <div role="dialog">请确认后继续</div>
      </main>
    `;

    expect(new BossAdapter(document).detectBlockingCondition()).toBe("遇到未知弹窗或页面提示");
  });

  it("pauses on unknown page layout", () => {
    document.body.innerHTML = `<main>机器人软件工程师 示例科技</main>`;

    expect(new BossAdapter(document).detectBlockingCondition()).toBe("页面结构未知");
  });

  it("does not pause on a Boss list page fixture", () => {
    document.body.innerHTML = readFileSync(join(fixtureDir, "fixtures/boss-list.html"), "utf-8");

    expect(new BossAdapter(document).detectBlockingCondition()).toBeNull();
  });
});
