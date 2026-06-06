import { JobPosting, JobPostingSchema } from "@job-apply-assistant/shared-schema";

const BOSS_ORIGIN = "https://www.zhipin.com";

function normalizeText(value: string | null | undefined): string | undefined {
  return value?.replace(/\s+/g, " ").trim() || undefined;
}

function trimToUndefined(value: string | null | undefined): string | undefined {
  return value?.trim() || undefined;
}

function text(root: ParentNode, selector: string): string | undefined {
  return normalizeText(root.querySelector(selector)?.textContent);
}

function absoluteBossUrl(href: string): string {
  const url = new URL(href, BOSS_ORIGIN);
  if (url.protocol !== "https:" || url.hostname !== "www.zhipin.com") {
    throw new Error("Unsupported Boss job URL");
  }
  return url.toString();
}

export class BossAdapter {
  constructor(private readonly doc: Document) {}

  extractListJobs(): JobPosting[] {
    const cards = Array.from(this.doc.querySelectorAll(".job-card-wrapper"));
    return cards.map((card) => this.extractCard(card)).filter((job): job is JobPosting => job !== null);
  }

  private extractCard(card: Element): JobPosting | null {
    const link = card.querySelector<HTMLAnchorElement>(".job-card-left");
    const href = trimToUndefined(link?.getAttribute("href"));
    const title = text(card, ".job-name");
    const city = text(card, ".job-area");
    const salaryText = text(card, ".salary");
    const companyName = text(card, ".company-name");
    const tags = Array.from(card.querySelectorAll(".tag-list li")).map((item) => normalizeText(item.textContent));
    const description = text(card, ".job-desc");

    if (!href || !title || !city || !salaryText || !companyName || !description) {
      return null;
    }

    let url: string;
    try {
      url = absoluteBossUrl(href);
    } catch {
      return null;
    }

    const parsedJob = JobPostingSchema.safeParse({
      source: "boss",
      url,
      title,
      companyName,
      city,
      salaryText,
      experienceText: tags[0],
      educationText: tags[1],
      description,
      bossActiveText: text(card, ".boss-online-tag"),
      publishedText: text(card, ".job-pub-time"),
    });
    return parsedJob.success ? parsedJob.data : null;
  }

  detectBlockingCondition(): string | null {
    const pageText = normalizeText(this.doc.body.textContent) ?? "";
    if (pageText.includes("验证码") || pageText.includes("人机验证")) return "遇到验证码或人机验证";
    if (pageText.includes("登录") && pageText.includes("扫码")) return "登录状态失效";
    if (["请先登录", "登录后查看", "未登录"].some((prompt) => pageText.includes(prompt))) {
      return "登录状态失效";
    }
    if (pageText.includes("账号异常")) return "账号异常提示";
    const blockingDialog = this.doc.querySelector(
      '[role="dialog"], .modal, .dialog, .popup, .captcha, .verify, .login-dialog',
    );
    if (normalizeText(blockingDialog?.textContent)) return "遇到未知弹窗或页面提示";
    if (!this.doc.querySelector(".job-card-wrapper")) return "页面结构未知";
    return null;
  }
}
