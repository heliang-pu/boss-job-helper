import { JobPosting, JobPostingSchema } from "@job-apply-assistant/shared-schema";

const BOSS_ORIGIN = "https://www.zhipin.com";

const BOSS_FONT_DIGITS: Record<string, string> = {
  "\ue031": "0",
  "\ue032": "1",
  "\ue033": "2",
  "\ue034": "3",
  "\ue035": "4",
  "\ue036": "5",
  "\ue037": "6",
  "\ue038": "7",
  "\ue039": "8",
  "\ue03a": "9",
};

function decodeBossFontDigits(value: string): string {
  return value.replace(/[\ue031-\ue03a]/g, (char) => BOSS_FONT_DIGITS[char] ?? char);
}

function normalizeText(value: string | null | undefined): string | undefined {
  return value ? decodeBossFontDigits(value).replace(/\s+/g, " ").trim() || undefined : undefined;
}

function trimToUndefined(value: string | null | undefined): string | undefined {
  return value?.trim() || undefined;
}

function text(root: ParentNode, selector: string): string | undefined {
  return normalizeText(root.querySelector(selector)?.textContent);
}

function firstText(root: ParentNode, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const value = text(root, selector);
    if (value) return value;
  }
  return undefined;
}

function absoluteBossUrl(href: string): string {
  const url = new URL(href, BOSS_ORIGIN);
  if (url.protocol !== "https:" || url.hostname !== "www.zhipin.com") {
    throw new Error("Unsupported Boss job URL");
  }
  return url.toString();
}

const JOB_CARD_SELECTOR = [
  ".job-card-wrapper",
  ".job-card-box",
  ".job-card-wrap",
  "[class*='job-card']",
  "[class*='job-list'] li",
].join(", ");

const JOB_LINK_SELECTOR = [
  "a.job-card-left",
  "a[href*='/job_detail/']",
].join(", ");

function hasJobCards(doc: Document): boolean {
  return findJobCardElements(doc).length > 0;
}

function hasLoginPrompt(doc: Document, pageText: string): boolean {
  if (["请先登录", "登录后查看", "未登录", "请登录后使用", "请扫码登录"].some((prompt) => pageText.includes(prompt))) {
    return true;
  }

  const loginDialog = doc.querySelector(".login-dialog, .login-box, [class*='login']");
  return normalizeText(loginDialog?.textContent)?.includes("登录") ?? false;
}

function hasJobLink(element: Element): boolean {
  return element.matches(JOB_LINK_SELECTOR) || Boolean(element.querySelector(JOB_LINK_SELECTOR));
}

function looksLikeJobCard(element: Element): boolean {
  const content = normalizeText(element.textContent) ?? "";
  return Boolean(
    hasJobLink(element) &&
      content.length >= 8 &&
      (/\d+\s*-\s*\d+K|面议/.test(content) || content.includes("薪")) &&
      (content.includes("上海") || content.includes("北京") || content.includes("深圳") || content.includes("广州")),
  );
}

function findCardContainer(link: HTMLAnchorElement): Element {
  const explicitCard = link.closest(".job-card-box, .job-card-wrap, .job-card-wrapper, [class*='job-card']");
  if (explicitCard && looksLikeJobCard(explicitCard)) {
    return explicitCard;
  }

  let current: Element | null = link;
  for (let depth = 0; current && depth < 8; depth += 1) {
    if (looksLikeJobCard(current)) return current;
    current = current.parentElement;
  }
  return link;
}

function findJobCardElements(doc: Document): Element[] {
  const explicitCards = Array.from(doc.querySelectorAll(JOB_CARD_SELECTOR)).filter(looksLikeJobCard);
  const linkCards = Array.from(doc.querySelectorAll<HTMLAnchorElement>("a[href*='/job_detail/']"))
    .map(findCardContainer)
    .filter(looksLikeJobCard);

  return Array.from(new Set([...explicitCards, ...linkCards]));
}

function salaryFromText(value: string | undefined): string | undefined {
  return value?.match(/\d+\s*-\s*\d+K(?:·\d+薪)?|面议/)?.[0].replace(/\s+/g, "") ?? undefined;
}

function salaryFromElement(card: Element, cardText: string | undefined): string | undefined {
  const salaryNodeText = firstText(card, [".salary", "[class*='salary']", "[class*='pay']"]);
  return salaryFromText(salaryNodeText) ?? salaryFromText(cardText);
}

function cityFromText(value: string | undefined): string | undefined {
  return value?.match(/上海|北京|深圳|广州|杭州|苏州|南京|成都|武汉|西安|重庆|天津|长沙|合肥|郑州|青岛|宁波/)?.[0];
}

function titleFromText(value: string | undefined, salaryText: string | undefined): string | undefined {
  if (!value) return undefined;
  const beforeSalary = salaryText ? value.split(salaryText)[0] : value;
  return normalizeText(beforeSalary);
}

function companyFromText(value: string | undefined, city: string | undefined): string | undefined {
  if (!value || !city) return undefined;
  const companyMatch = value.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·]{2,30})(?=\s*上海\s*[静黄徐长普虹杨浦闵宝嘉浦松青奉崇])/);
  if (companyMatch?.[1]) return normalizeText(companyMatch[1]);

  const cityIndex = value.lastIndexOf(city);
  if (cityIndex <= 0) return undefined;
  const beforeCity = value.slice(0, cityIndex);
  const tokens = beforeCity.split(/\s+/).filter(Boolean);
  return normalizeText(tokens.at(-1));
}

export class BossAdapter {
  constructor(private readonly doc: Document) {}

  extractListJobs(): JobPosting[] {
    const seenUrls = new Set<string>();
    const jobs: JobPosting[] = [];

    for (const card of findJobCardElements(this.doc)) {
      const job = this.extractCard(card);
      if (!job || seenUrls.has(job.url)) continue;
      seenUrls.add(job.url);
      jobs.push(job);
    }

    return jobs;
  }

  private extractCard(card: Element): JobPosting | null {
    const link = card.matches("a") ? (card as HTMLAnchorElement) : card.querySelector<HTMLAnchorElement>(JOB_LINK_SELECTOR);
    const href = trimToUndefined(link?.getAttribute("href"));
    const cardText = normalizeText(card.textContent);
    const city = firstText(card, [".job-area", "[class*='job-area']", "[class*='area']"]) ?? cityFromText(cardText);
    const salaryText = salaryFromElement(card, cardText);
    const title =
      firstText(card, [".job-name", "[class*='job-name']", ".job-title", "[class*='job-title']"]) ??
      titleFromText(normalizeText(link?.textContent) ?? cardText, salaryText);
    const companyName =
      firstText(card, [".company-name", "[class*='company-name']", "[class*='brand-name']", "[class*='company']"]) ??
      companyFromText(cardText, city) ??
      "未知公司";
    const tags = Array.from(card.querySelectorAll(".tag-list li")).map((item) => normalizeText(item.textContent));
    const description =
      firstText(card, [".job-desc", "[class*='job-desc']"]) ?? cardText;

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
      publishedText: firstText(card, [".job-pub-time", "[class*='pub-time']", "[class*='publish']"]) ?? "今日发布",
    });
    return parsedJob.success ? parsedJob.data : null;
  }

  extractDetailJob(baseJob?: JobPosting): JobPosting | null {
    const pageText = normalizeText(this.doc.body.textContent);
    const title =
      firstText(this.doc, [".job-title", ".job-name", "[class*='job-title']", "[class*='job-name']", "h1"]) ??
      baseJob?.title;
    const companyName =
      firstText(this.doc, [".company-name", "[class*='company-name']", "[class*='brand-name']", "[class*='company']"]) ??
      baseJob?.companyName;
    const city =
      firstText(this.doc, [".job-address", ".job-area", "[class*='address']", "[class*='job-area']", "[class*='area']"]) ??
      cityFromText(pageText) ??
      baseJob?.city;
    const salaryText =
      salaryFromElement(this.doc.documentElement, pageText) ??
      baseJob?.salaryText;
    const description =
      firstText(this.doc, [
        ".job-sec-text",
        ".job-detail-section",
        ".job-detail",
        "[class*='job-sec-text']",
        "[class*='job-detail']",
        "[class*='description']",
        "[class*='desc']",
      ]) ??
      pageText ??
      baseJob?.description;

    const parsedJob = JobPostingSchema.safeParse({
      source: "boss",
      url: window.location.href,
      title,
      companyName,
      city,
      salaryText,
      experienceText: baseJob?.experienceText,
      educationText: baseJob?.educationText,
      industryText: baseJob?.industryText,
      description,
      bossActiveText: baseJob?.bossActiveText,
      publishedText: baseJob?.publishedText ?? "今日发布",
    });
    return parsedJob.success ? parsedJob.data : null;
  }

  detectBlockingCondition(): string | null {
    const pageText = normalizeText(this.doc.body.textContent) ?? "";
    if (pageText.includes("验证码") || pageText.includes("人机验证")) return "遇到验证码或人机验证";
    if (hasLoginPrompt(this.doc, pageText)) {
      return "登录状态失效";
    }
    if (pageText.includes("账号异常")) return "账号异常提示";
    const blockingDialog = this.doc.querySelector(
      '[role="dialog"], .modal, .dialog, .popup, .captcha, .verify, .login-dialog',
    );
    if (normalizeText(blockingDialog?.textContent)) return "遇到未知弹窗或页面提示";
    if (!hasJobCards(this.doc)) return "页面结构未知";
    return null;
  }
}
