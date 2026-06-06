# Boss Job Apply Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working Boss 直聘 MVP: import a PDF/DOCX resume, configure an OpenAI-compatible model, scan Boss job pages, score matches, generate greeting messages, and perform controlled auto-apply with pause-on-exception behavior.

**Architecture:** Use a Chrome/Edge Manifest V3 extension for page reading, UI, and browser actions. Use a Python FastAPI local service bound to `127.0.0.1` for resume parsing, AI calls, matching, SQLite persistence, queue state, and audit logs. Keep the extension and service connected through versioned JSON APIs and shared TypeScript schemas.

**Tech Stack:** Chrome/Edge Manifest V3, React, TypeScript, Vite, Vitest, jsdom, Python 3.11+, FastAPI, Pydantic, SQLite, pytest, httpx, pypdf, python-docx, OpenAI-compatible chat-completions API.

---

## Scope Check

This spec spans two components, but they are one vertical MVP rather than independent products: the extension needs the local service for matching, and the local service needs extension-provided job data for the apply loop. The plan keeps work sliced by testable boundaries: repository scaffold, shared contract, service foundations, extension foundations, Boss adapter, automation, UI, and integration.

## File Structure

Create this project structure:

```text
job-apply-assistant/
  README.md
  package.json
  .gitignore
  apps/
    extension/
      index.html
      manifest.config.ts
      package.json
      tsconfig.json
      vite.config.ts
      src/
        background/
        content/
        dashboard/
        popup/
        shared/
        test/
    local-service/
      pyproject.toml
      job_apply_assistant/
        __init__.py
        ai_client.py
        api.py
        apply_queue.py
        main.py
        matching.py
        models.py
        resume_parser.py
        storage.py
      tests/
  packages/
    shared-schema/
      package.json
      tsconfig.json
      src/
        index.ts
        index.test.ts
  docs/
    superpowers/
      specs/
      plans/
```

Responsibilities:

- `packages/shared-schema`: TypeScript schemas and types used by extension tests and UI.
- `apps/local-service/job_apply_assistant/models.py`: Pydantic models that mirror the shared schema.
- `apps/local-service/job_apply_assistant/resume_parser.py`: PDF/DOCX text extraction and `ResumeProfile` creation.
- `apps/local-service/job_apply_assistant/ai_client.py`: OpenAI-compatible client with deterministic test doubles.
- `apps/local-service/job_apply_assistant/matching.py`: Hard filters, AI scoring, and greeting generation.
- `apps/local-service/job_apply_assistant/apply_queue.py`: Apply task state machine, caps, intervals, and pause reasons.
- `apps/local-service/job_apply_assistant/storage.py`: SQLite persistence.
- `apps/local-service/job_apply_assistant/api.py`: FastAPI routes.
- `apps/extension/src/content/bossAdapter.ts`: Boss DOM extraction and action helpers.
- `apps/extension/src/shared/localApiClient.ts`: Extension-to-service client.
- `apps/extension/src/background/automationController.ts`: Queue execution and pause-on-exception orchestration.
- `apps/extension/src/dashboard`, `apps/extension/src/popup`, `apps/extension/src/content/FloatingPanel.tsx`: User interfaces.

---

### Task 1: Repository Scaffold And Tooling

**Files:**
- Create: `tests/repo_layout.test.mjs`
- Create: `.gitignore`
- Create: `README.md`
- Create: `package.json`
- Create: `apps/local-service/pyproject.toml`
- Create: `apps/local-service/job_apply_assistant/__init__.py`
- Create: `apps/local-service/tests/__init__.py`
- Create: `apps/extension/package.json`
- Create: `apps/extension/tsconfig.json`
- Create: `apps/extension/vite.config.ts`
- Create: `apps/extension/index.html`

- [ ] **Step 1: Write the failing repository layout test**

Create `tests/repo_layout.test.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

test("repository has the MVP monorepo layout", () => {
  const requiredPaths = [
    "package.json",
    "apps/extension/package.json",
    "apps/extension/vite.config.ts",
    "apps/local-service/pyproject.toml",
    "apps/local-service/job_apply_assistant/__init__.py",
    "packages/shared-schema",
    "docs/superpowers/specs/2026-06-06-boss-job-apply-assistant-design.md",
  ];

  for (const path of requiredPaths) {
    assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
  }
});
```

- [ ] **Step 2: Run the layout test and verify it fails**

Run: `node --test tests/repo_layout.test.mjs`

Expected: FAIL because `package.json`, `apps/extension`, `apps/local-service`, and `packages/shared-schema` do not exist yet.

- [ ] **Step 3: Create root project files**

Create `.gitignore`:

```gitignore
node_modules/
dist/
.vite/
.pytest_cache/
__pycache__/
*.pyc
.ruff_cache/
.coverage
.env
.env.*
!.env.example
local-data/
.superpowers/
```

Create `package.json`:

```json
{
  "name": "job-apply-assistant",
  "private": true,
  "type": "module",
  "workspaces": [
    "apps/extension",
    "packages/shared-schema"
  ],
  "scripts": {
    "test": "npm run test --workspaces --if-present && node --test tests/repo_layout.test.mjs",
    "test:repo": "node --test tests/repo_layout.test.mjs",
    "build": "npm run build --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.7.0"
  }
}
```

Create `README.md`:

```markdown
# Boss 直聘自动求职助手

Chrome/Edge 扩展 + 本地服务，用于根据简历匹配 Boss 直聘岗位，并执行可控的自动沟通/投递流程。

第一版边界：

- 只支持 Boss 直聘。
- 本地服务只监听 `127.0.0.1`。
- 遇到验证码、登录异常、风控提示、未知弹窗或页面结构未知时暂停。
- 不做验证码绕过、风控规避、无限制批量投递。
```

- [ ] **Step 4: Create local service scaffold**

Create `apps/local-service/pyproject.toml`:

```toml
[project]
name = "job-apply-assistant-local-service"
version = "0.1.0"
description = "Local FastAPI service for resume parsing, AI matching, and apply queue management."
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.115.0",
  "uvicorn[standard]>=0.32.0",
  "pydantic>=2.10.0",
  "httpx>=0.28.0",
  "pypdf>=5.1.0",
  "python-docx>=1.1.2"
]

[project.optional-dependencies]
test = [
  "pytest>=8.3.0",
  "pytest-cov>=6.0.0",
  "reportlab>=4.2.0"
]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]

[tool.ruff]
line-length = 110

[tool.ruff.format]
quote-style = "double"
```

Create `apps/local-service/job_apply_assistant/__init__.py`:

```python
__all__ = ["__version__"]

__version__ = "0.1.0"
```

Create `apps/local-service/tests/__init__.py` as an empty file.

- [ ] **Step 5: Create extension scaffold**

Create `apps/extension/package.json`:

```json
{
  "name": "@job-apply-assistant/extension",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@job-apply-assistant/shared-schema": "0.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.30",
    "@vitejs/plugin-react": "^4.3.4",
    "@types/chrome": "^0.0.287",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

Create `apps/extension/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["chrome", "vitest/globals"]
  },
  "include": ["src", "manifest.config.ts", "vite.config.ts"]
}
```

Create `apps/extension/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

Create `apps/extension/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Boss 求职助手</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/dashboard/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create shared-schema directory marker**

Run: `mkdir -p packages/shared-schema/src`

- [ ] **Step 7: Run the layout test and verify it passes**

Run: `node --test tests/repo_layout.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add .gitignore README.md package.json tests/repo_layout.test.mjs apps packages
git commit -m "chore: scaffold job apply assistant workspace"
```

---

### Task 2: Shared TypeScript Contract

**Files:**
- Create: `packages/shared-schema/package.json`
- Create: `packages/shared-schema/tsconfig.json`
- Create: `packages/shared-schema/src/index.ts`
- Create: `packages/shared-schema/src/index.test.ts`

- [ ] **Step 1: Create the failing schema tests**

Create `packages/shared-schema/src/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ApplyTaskSchema, JobPostingSchema, MatchResultSchema, SearchPreferenceSchema } from "./index";

describe("shared schemas", () => {
  it("validates a Boss job posting", () => {
    const parsed = JobPostingSchema.parse({
      source: "boss",
      url: "https://www.zhipin.com/job_detail/abc.html",
      title: "机器人算法工程师",
      companyName: "示例科技",
      city: "上海",
      salaryText: "25-40K",
      experienceText: "3-5年",
      educationText: "本科",
      description: "负责机器人感知与控制算法开发",
      bossActiveText: "刚刚活跃",
      publishedText: "今日发布",
    });

    expect(parsed.source).toBe("boss");
    expect(parsed.city).toBe("上海");
  });

  it("requires a positive match threshold", () => {
    expect(() =>
      SearchPreferenceSchema.parse({
        targetCities: ["上海"],
        keywords: ["机器人"],
        salaryMinK: 20,
        salaryMaxK: 45,
        blockedCompanies: [],
        blockedIndustries: [],
        recencyDays: 7,
        requireActiveBoss: true,
        matchThreshold: 0,
        dailyLimit: 20,
        applyWindowStart: "09:30",
        applyWindowEnd: "18:30",
        intervalMinSeconds: 90,
        intervalMaxSeconds: 240,
      }),
    ).toThrow();
  });

  it("validates match result and apply task state", () => {
    const match = MatchResultSchema.parse({
      passedHardFilters: true,
      hardFilterReasons: [],
      score: 86,
      reasons: ["项目经历与岗位方向匹配"],
      risks: ["薪资上限未明确"],
      greeting: "您好，我有机器人项目经验，和该岗位方向较匹配，期待沟通。",
      shouldQueue: true,
    });

    const task = ApplyTaskSchema.parse({
      id: "task_1",
      jobUrl: "https://www.zhipin.com/job_detail/abc.html",
      status: "queued",
      match,
      greeting: match.greeting,
      createdAt: "2026-06-06T10:00:00.000Z",
      updatedAt: "2026-06-06T10:00:00.000Z",
    });

    expect(task.status).toBe("queued");
  });
});
```

- [ ] **Step 2: Run the schema tests and verify they fail**

Run:

```bash
npm install
npm --workspace packages/shared-schema test
```

Expected: FAIL because `packages/shared-schema/package.json` and `src/index.ts` are missing.

- [ ] **Step 3: Create shared-schema package config**

Create `packages/shared-schema/package.json`:

```json
{
  "name": "@job-apply-assistant/shared-schema",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

Create `packages/shared-schema/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "declaration": true,
    "outDir": "dist",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Implement the schemas**

Create `packages/shared-schema/src/index.ts`:

```ts
import { z } from "zod";

export const JobPostingSchema = z.object({
  source: z.literal("boss"),
  url: z.string().url(),
  title: z.string().min(1),
  companyName: z.string().min(1),
  city: z.string().min(1),
  salaryText: z.string().min(1),
  experienceText: z.string().optional(),
  educationText: z.string().optional(),
  description: z.string().min(1),
  bossActiveText: z.string().optional(),
  publishedText: z.string().optional(),
});

export type JobPosting = z.infer<typeof JobPostingSchema>;

export const SearchPreferenceSchema = z
  .object({
    targetCities: z.array(z.string().min(1)).min(1),
    keywords: z.array(z.string().min(1)).min(1),
    salaryMinK: z.number().int().positive(),
    salaryMaxK: z.number().int().positive(),
    blockedCompanies: z.array(z.string()),
    blockedIndustries: z.array(z.string()),
    recencyDays: z.number().int().positive(),
    requireActiveBoss: z.boolean(),
    matchThreshold: z.number().int().min(1).max(100),
    dailyLimit: z.number().int().positive(),
    applyWindowStart: z.string().regex(/^\\d{2}:\\d{2}$/),
    applyWindowEnd: z.string().regex(/^\\d{2}:\\d{2}$/),
    intervalMinSeconds: z.number().int().positive(),
    intervalMaxSeconds: z.number().int().positive(),
  })
  .refine((value) => value.salaryMinK <= value.salaryMaxK, "salaryMinK must be <= salaryMaxK")
  .refine(
    (value) => value.intervalMinSeconds <= value.intervalMaxSeconds,
    "intervalMinSeconds must be <= intervalMaxSeconds",
  );

export type SearchPreference = z.infer<typeof SearchPreferenceSchema>;

export const ResumeProfileSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().min(1),
  rawText: z.string().min(1),
  summary: z.string(),
  skills: z.array(z.string()),
  yearsOfExperience: z.number().nonnegative(),
  projectHighlights: z.array(z.string()),
  education: z.array(z.string()),
  targetRoleSuggestions: z.array(z.string()),
});

export type ResumeProfile = z.infer<typeof ResumeProfileSchema>;

export const MatchResultSchema = z.object({
  passedHardFilters: z.boolean(),
  hardFilterReasons: z.array(z.string()),
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string()),
  risks: z.array(z.string()),
  greeting: z.string(),
  shouldQueue: z.boolean(),
});

export type MatchResult = z.infer<typeof MatchResultSchema>;

export const ApplyTaskStatusSchema = z.enum([
  "pending_review",
  "queued",
  "applying",
  "applied",
  "filtered",
  "needs_manual_action",
  "failed",
  "paused",
]);

export type ApplyTaskStatus = z.infer<typeof ApplyTaskStatusSchema>;

export const ApplyTaskSchema = z.object({
  id: z.string().min(1),
  jobUrl: z.string().url(),
  status: ApplyTaskStatusSchema,
  match: MatchResultSchema,
  greeting: z.string(),
  failureReason: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  appliedAt: z.string().datetime().optional(),
});

export type ApplyTask = z.infer<typeof ApplyTaskSchema>;
```

- [ ] **Step 5: Run schema tests and build**

Run:

```bash
npm install
npm --workspace packages/shared-schema test
npm --workspace packages/shared-schema build
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add package.json package-lock.json packages/shared-schema
git commit -m "feat(shared-schema): add MVP contract"
```

---

### Task 3: Local Service Pydantic Models

**Files:**
- Create: `apps/local-service/tests/test_models.py`
- Create: `apps/local-service/job_apply_assistant/models.py`

- [ ] **Step 1: Write failing model tests**

Create `apps/local-service/tests/test_models.py`:

```python
from pydantic import ValidationError
import pytest

from job_apply_assistant.models import ApplyTask, JobPosting, MatchResult, SearchPreference


def test_search_preference_validates_ranges() -> None:
    preference = SearchPreference(
        target_cities=["上海"],
        keywords=["机器人"],
        salary_min_k=20,
        salary_max_k=45,
        blocked_companies=[],
        blocked_industries=[],
        recency_days=7,
        require_active_boss=True,
        match_threshold=80,
        daily_limit=20,
        apply_window_start="09:30",
        apply_window_end="18:30",
        interval_min_seconds=90,
        interval_max_seconds=240,
    )

    assert preference.salary_min_k == 20


def test_search_preference_rejects_invalid_salary_range() -> None:
    with pytest.raises(ValidationError):
        SearchPreference(
            target_cities=["上海"],
            keywords=["机器人"],
            salary_min_k=50,
            salary_max_k=30,
            blocked_companies=[],
            blocked_industries=[],
            recency_days=7,
            require_active_boss=True,
            match_threshold=80,
            daily_limit=20,
            apply_window_start="09:30",
            apply_window_end="18:30",
            interval_min_seconds=90,
            interval_max_seconds=240,
        )


def test_apply_task_validates_status() -> None:
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/abc.html",
        title="机器人算法工程师",
        company_name="示例科技",
        city="上海",
        salary_text="25-40K",
        description="负责机器人感知与控制算法开发",
    )
    match = MatchResult(
        passed_hard_filters=True,
        hard_filter_reasons=[],
        score=86,
        reasons=["项目经历匹配"],
        risks=[],
        greeting="您好，我有机器人项目经验，期待沟通。",
        should_queue=True,
    )

    task = ApplyTask.create(job=job, match=match, greeting=match.greeting)

    assert task.status == "queued"
    assert task.job.url == job.url
```

- [ ] **Step 2: Run model tests and verify failure**

Run: `cd apps/local-service && python -m pytest tests/test_models.py -q`

Expected: FAIL because `job_apply_assistant.models` does not exist.

- [ ] **Step 3: Implement Pydantic models**

Create `apps/local-service/job_apply_assistant/models.py`:

```python
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class JobPosting(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source: Literal["boss"]
    url: str
    title: str
    company_name: str = Field(alias="companyName")
    city: str
    salary_text: str = Field(alias="salaryText")
    experience_text: str | None = Field(default=None, alias="experienceText")
    education_text: str | None = Field(default=None, alias="educationText")
    description: str
    boss_active_text: str | None = Field(default=None, alias="bossActiveText")
    published_text: str | None = Field(default=None, alias="publishedText")


class SearchPreference(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    target_cities: list[str] = Field(alias="targetCities")
    keywords: list[str]
    salary_min_k: int = Field(alias="salaryMinK", gt=0)
    salary_max_k: int = Field(alias="salaryMaxK", gt=0)
    blocked_companies: list[str] = Field(alias="blockedCompanies")
    blocked_industries: list[str] = Field(alias="blockedIndustries")
    recency_days: int = Field(alias="recencyDays", gt=0)
    require_active_boss: bool = Field(alias="requireActiveBoss")
    match_threshold: int = Field(alias="matchThreshold", ge=1, le=100)
    daily_limit: int = Field(alias="dailyLimit", gt=0)
    apply_window_start: str = Field(alias="applyWindowStart")
    apply_window_end: str = Field(alias="applyWindowEnd")
    interval_min_seconds: int = Field(alias="intervalMinSeconds", gt=0)
    interval_max_seconds: int = Field(alias="intervalMaxSeconds", gt=0)

    @field_validator("target_cities", "keywords")
    @classmethod
    def require_non_empty_strings(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values if value.strip()]
        if not cleaned:
            raise ValueError("list must contain at least one non-empty string")
        return cleaned

    @model_validator(mode="after")
    def validate_ranges(self) -> SearchPreference:
        if self.salary_min_k > self.salary_max_k:
            raise ValueError("salary_min_k must be <= salary_max_k")
        if self.interval_min_seconds > self.interval_max_seconds:
            raise ValueError("interval_min_seconds must be <= interval_max_seconds")
        return self


class ResumeProfile(BaseModel):
    id: str
    file_name: str = Field(alias="fileName")
    raw_text: str = Field(alias="rawText")
    summary: str
    skills: list[str]
    years_of_experience: float = Field(alias="yearsOfExperience")
    project_highlights: list[str] = Field(alias="projectHighlights")
    education: list[str]
    target_role_suggestions: list[str] = Field(alias="targetRoleSuggestions")


class MatchResult(BaseModel):
    passed_hard_filters: bool = Field(alias="passedHardFilters")
    hard_filter_reasons: list[str] = Field(alias="hardFilterReasons")
    score: int = Field(ge=0, le=100)
    reasons: list[str]
    risks: list[str]
    greeting: str
    should_queue: bool = Field(alias="shouldQueue")


ApplyTaskStatus = Literal[
    "pending_review",
    "queued",
    "applying",
    "applied",
    "filtered",
    "needs_manual_action",
    "failed",
    "paused",
]


class ApplyTask(BaseModel):
    id: str
    job: JobPosting
    status: ApplyTaskStatus
    match: MatchResult
    greeting: str
    failure_reason: str | None = Field(default=None, alias="failureReason")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
    applied_at: str | None = Field(default=None, alias="appliedAt")

    @classmethod
    def create(cls, job: JobPosting, match: MatchResult, greeting: str) -> ApplyTask:
        now = utc_now_iso()
        status: ApplyTaskStatus = "queued" if match.should_queue else "filtered"
        return cls(
            id=f"task_{uuid4().hex}",
            job=job,
            status=status,
            match=match,
            greeting=greeting,
            createdAt=now,
            updatedAt=now,
        )
```

- [ ] **Step 4: Run model tests**

Run: `cd apps/local-service && python -m pytest tests/test_models.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/local-service
git commit -m "feat(local-service): add core models"
```

---

### Task 4: Resume Parser

**Files:**
- Create: `apps/local-service/tests/test_resume_parser.py`
- Create: `apps/local-service/job_apply_assistant/resume_parser.py`

- [ ] **Step 1: Write failing parser tests**

Create `apps/local-service/tests/test_resume_parser.py`:

```python
from pathlib import Path

from docx import Document
from reportlab.pdfgen import canvas

from job_apply_assistant.resume_parser import ResumeParser


def write_docx(path: Path, text: str) -> None:
    document = Document()
    document.add_paragraph(text)
    document.save(path)


def write_pdf(path: Path, text: str) -> None:
    pdf = canvas.Canvas(str(path))
    pdf.drawString(72, 720, text)
    pdf.save()


def test_parse_docx_resume(tmp_path: Path) -> None:
    path = tmp_path / "resume.docx"
    write_docx(path, "张三 机器人算法工程师 Python ROS 机械臂 项目经验")

    profile = ResumeParser().parse(path)

    assert profile.file_name == "resume.docx"
    assert "机器人算法工程师" in profile.raw_text
    assert "Python" in profile.skills


def test_parse_pdf_resume(tmp_path: Path) -> None:
    path = tmp_path / "resume.pdf"
    write_pdf(path, "Li Engineer Python Robot Control")

    profile = ResumeParser().parse(path)

    assert profile.file_name == "resume.pdf"
    assert "Python" in profile.raw_text


def test_reject_unsupported_file(tmp_path: Path) -> None:
    path = tmp_path / "resume.txt"
    path.write_text("plain text", encoding="utf-8")

    try:
        ResumeParser().parse(path)
    except ValueError as exc:
        assert "Unsupported resume file type" in str(exc)
    else:
        raise AssertionError("unsupported file should raise ValueError")
```

- [ ] **Step 2: Run parser tests and verify failure**

Run: `cd apps/local-service && python -m pytest tests/test_resume_parser.py -q`

Expected: FAIL because `job_apply_assistant.resume_parser` does not exist.

- [ ] **Step 3: Implement parser**

Create `apps/local-service/job_apply_assistant/resume_parser.py`:

```python
from __future__ import annotations

import re
from pathlib import Path
from uuid import uuid4

from docx import Document
from pypdf import PdfReader

from job_apply_assistant.models import ResumeProfile


SKILL_KEYWORDS = [
    "Python",
    "TypeScript",
    "JavaScript",
    "React",
    "ROS",
    "机器人",
    "机械臂",
    "算法",
    "控制",
    "感知",
    "深度学习",
    "机器学习",
]


class ResumeParser:
    def parse(self, path: Path) -> ResumeProfile:
        suffix = path.suffix.lower()
        if suffix == ".pdf":
            text = self._extract_pdf(path)
        elif suffix == ".docx":
            text = self._extract_docx(path)
        else:
            raise ValueError(f"Unsupported resume file type: {suffix}")

        cleaned = self._normalize_text(text)
        skills = [skill for skill in SKILL_KEYWORDS if skill.lower() in cleaned.lower()]

        return ResumeProfile(
            id=f"resume_{uuid4().hex}",
            fileName=path.name,
            rawText=cleaned,
            summary=cleaned[:500],
            skills=skills,
            yearsOfExperience=self._extract_years(cleaned),
            projectHighlights=self._extract_project_highlights(cleaned),
            education=self._extract_education(cleaned),
            targetRoleSuggestions=self._suggest_roles(cleaned),
        )

    def _extract_pdf(self, path: Path) -> str:
        reader = PdfReader(str(path))
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    def _extract_docx(self, path: Path) -> str:
        document = Document(str(path))
        return "\n".join(paragraph.text for paragraph in document.paragraphs)

    def _normalize_text(self, text: str) -> str:
        return re.sub(r"\s+", " ", text).strip()

    def _extract_years(self, text: str) -> float:
        match = re.search(r"(\d+(?:\.\d+)?)\s*年", text)
        return float(match.group(1)) if match else 0.0

    def _extract_project_highlights(self, text: str) -> list[str]:
        sentences = re.split(r"[。.!?]", text)
        return [sentence.strip() for sentence in sentences if "项目" in sentence][:5]

    def _extract_education(self, text: str) -> list[str]:
        education_words = ["本科", "硕士", "博士", "大专"]
        return [word for word in education_words if word in text]

    def _suggest_roles(self, text: str) -> list[str]:
        roles: list[str] = []
        if "机器人" in text or "ROS" in text:
            roles.append("机器人软件工程师")
        if "算法" in text or "深度学习" in text:
            roles.append("算法工程师")
        if "React" in text or "TypeScript" in text:
            roles.append("前端工程师")
        return roles or ["软件工程师"]
```

- [ ] **Step 4: Run parser tests**

Run: `cd apps/local-service && python -m pytest tests/test_resume_parser.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/local-service
git commit -m "feat(local-service): parse PDF and DOCX resumes"
```

---

### Task 5: AI Client And Matching Service

**Files:**
- Create: `apps/local-service/tests/test_ai_client.py`
- Create: `apps/local-service/tests/test_matching.py`
- Create: `apps/local-service/job_apply_assistant/ai_client.py`
- Create: `apps/local-service/job_apply_assistant/matching.py`

- [ ] **Step 1: Write failing AI client tests**

Create `apps/local-service/tests/test_ai_client.py`:

```python
import httpx
import pytest

from job_apply_assistant.ai_client import AIClient, AIConfig


@pytest.mark.asyncio
async def test_chat_completion_uses_openai_compatible_endpoint() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://api.example.com/v1/chat/completions"
        payload = request.read().decode("utf-8")
        assert "机器人算法工程师" in payload
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": "{\"score\":86,\"reasons\":[\"技能匹配\"],\"risks\":[],\"greeting\":\"您好，期待沟通。\"}"
                        }
                    }
                ]
            },
        )

    transport = httpx.MockTransport(handler)
    client = AIClient(
        AIConfig(base_url="https://api.example.com/v1", api_key="secret", model="test-model"),
        http_client=httpx.AsyncClient(transport=transport),
    )

    content = await client.complete_json("分析岗位", {"title": "机器人算法工程师"})

    assert content["score"] == 86
```

- [ ] **Step 2: Write failing matching tests**

Create `apps/local-service/tests/test_matching.py`:

```python
import pytest

from job_apply_assistant.matching import MatchingService
from job_apply_assistant.models import JobPosting, ResumeProfile, SearchPreference


class FakeAIClient:
    async def complete_json(self, system_prompt: str, payload: dict) -> dict:
        return {
            "score": 88,
            "reasons": ["ROS 和机器人项目经验匹配"],
            "risks": [],
            "greeting": "您好，我有 ROS 和机器人项目经验，和岗位方向匹配，期待沟通。",
        }


def make_preference() -> SearchPreference:
    return SearchPreference(
        targetCities=["上海"],
        keywords=["机器人", "ROS"],
        salaryMinK=20,
        salaryMaxK=45,
        blockedCompanies=["黑名单公司"],
        blockedIndustries=[],
        recencyDays=7,
        requireActiveBoss=True,
        matchThreshold=80,
        dailyLimit=20,
        applyWindowStart="09:30",
        applyWindowEnd="18:30",
        intervalMinSeconds=90,
        intervalMaxSeconds=240,
    )


def make_resume() -> ResumeProfile:
    return ResumeProfile(
        id="resume_1",
        fileName="resume.pdf",
        rawText="机器人 ROS Python 项目经验",
        summary="机器人 ROS Python",
        skills=["Python", "ROS", "机器人"],
        yearsOfExperience=3,
        projectHighlights=["机器人项目"],
        education=["本科"],
        targetRoleSuggestions=["机器人软件工程师"],
    )


@pytest.mark.asyncio
async def test_match_passes_when_hard_filters_and_ai_score_pass() -> None:
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/1.html",
        title="机器人软件工程师",
        companyName="示例科技",
        city="上海",
        salaryText="25-40K",
        description="ROS Python 机器人控制",
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )

    result = await MatchingService(FakeAIClient()).match(job, make_resume(), make_preference())

    assert result.should_queue is True
    assert result.score == 88


@pytest.mark.asyncio
async def test_match_filters_blocked_company_before_ai_call() -> None:
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/2.html",
        title="机器人软件工程师",
        companyName="黑名单公司",
        city="上海",
        salaryText="25-40K",
        description="ROS Python 机器人控制",
    )

    result = await MatchingService(FakeAIClient()).match(job, make_resume(), make_preference())

    assert result.should_queue is False
    assert "公司在黑名单中" in result.hard_filter_reasons
```

- [ ] **Step 3: Run AI and matching tests and verify failure**

Run: `cd apps/local-service && python -m pytest tests/test_ai_client.py tests/test_matching.py -q`

Expected: FAIL because `ai_client.py` and `matching.py` do not exist.

- [ ] **Step 4: Implement AI client**

Create `apps/local-service/job_apply_assistant/ai_client.py`:

```python
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True)
class AIConfig:
    base_url: str
    api_key: str
    model: str
    timeout_seconds: float = 30.0


class AIClient:
    def __init__(self, config: AIConfig, http_client: httpx.AsyncClient | None = None) -> None:
        self.config = config
        self.http_client = http_client or httpx.AsyncClient(timeout=config.timeout_seconds)

    async def complete_json(self, system_prompt: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.config.base_url.rstrip('/')}/chat/completions"
        response = await self.http_client.post(
            url,
            headers={"Authorization": f"Bearer {self.config.api_key}"},
            json={
                "model": self.config.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        return json.loads(content)
```

- [ ] **Step 5: Implement matching service**

Create `apps/local-service/job_apply_assistant/matching.py`:

```python
from __future__ import annotations

import re
from typing import Protocol

from job_apply_assistant.models import JobPosting, MatchResult, ResumeProfile, SearchPreference


class JsonCompletionClient(Protocol):
    async def complete_json(self, system_prompt: str, payload: dict) -> dict:
        pass


class MatchingService:
    def __init__(self, ai_client: JsonCompletionClient) -> None:
        self.ai_client = ai_client

    async def match(
        self,
        job: JobPosting,
        resume: ResumeProfile,
        preference: SearchPreference,
    ) -> MatchResult:
        hard_filter_reasons = self._hard_filter(job, preference)
        if hard_filter_reasons:
            return MatchResult(
                passedHardFilters=False,
                hardFilterReasons=hard_filter_reasons,
                score=0,
                reasons=[],
                risks=[],
                greeting="",
                shouldQueue=False,
            )

        ai_result = await self.ai_client.complete_json(
            "你是求职匹配助手。只返回 JSON：score 0-100、reasons 字符串数组、risks 字符串数组、greeting 字符串。",
            {
                "resume": resume.model_dump(by_alias=True),
                "preference": preference.model_dump(by_alias=True),
                "job": job.model_dump(by_alias=True),
            },
        )
        score = int(ai_result["score"])
        return MatchResult(
            passedHardFilters=True,
            hardFilterReasons=[],
            score=score,
            reasons=list(ai_result.get("reasons", [])),
            risks=list(ai_result.get("risks", [])),
            greeting=str(ai_result.get("greeting", "")),
            shouldQueue=score >= preference.match_threshold,
        )

    def _hard_filter(self, job: JobPosting, preference: SearchPreference) -> list[str]:
        reasons: list[str] = []
        if job.city not in preference.target_cities:
            reasons.append("城市不匹配")
        if any(blocked in job.company_name for blocked in preference.blocked_companies):
            reasons.append("公司在黑名单中")
        if not any(keyword.lower() in f"{job.title} {job.description}".lower() for keyword in preference.keywords):
            reasons.append("岗位关键词不匹配")
        if preference.require_active_boss and job.boss_active_text:
            inactive_words = ["本月活跃", "很久没活跃", "半年前活跃"]
            if any(word in job.boss_active_text for word in inactive_words):
                reasons.append("Boss 活跃度不满足")
        salary_range = self._parse_salary_range(job.salary_text)
        if salary_range is not None:
            salary_min, salary_max = salary_range
            if salary_max < preference.salary_min_k or salary_min > preference.salary_max_k:
                reasons.append("薪资范围不匹配")
        return reasons

    def _parse_salary_range(self, salary_text: str) -> tuple[int, int] | None:
        match = re.search(r"(\\d+)\\s*-\\s*(\\d+)\\s*K", salary_text, re.IGNORECASE)
        if not match:
            return None
        return int(match.group(1)), int(match.group(2))
```

- [ ] **Step 6: Run AI and matching tests**

Run: `cd apps/local-service && python -m pytest tests/test_ai_client.py tests/test_matching.py -q`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/local-service
git commit -m "feat(local-service): score jobs with AI matching"
```

---

### Task 6: SQLite Storage And Apply Queue

**Files:**
- Create: `apps/local-service/tests/test_storage.py`
- Create: `apps/local-service/tests/test_apply_queue.py`
- Create: `apps/local-service/job_apply_assistant/storage.py`
- Create: `apps/local-service/job_apply_assistant/apply_queue.py`

- [ ] **Step 1: Write failing storage tests**

Create `apps/local-service/tests/test_storage.py`:

```python
from pathlib import Path

from job_apply_assistant.models import MatchResult
from job_apply_assistant.storage import Storage


def test_storage_saves_and_loads_match_result(tmp_path: Path) -> None:
    storage = Storage(tmp_path / "app.db")
    storage.initialize()

    result = MatchResult(
        passedHardFilters=True,
        hardFilterReasons=[],
        score=90,
        reasons=["技能匹配"],
        risks=[],
        greeting="您好，期待沟通。",
        shouldQueue=True,
    )

    storage.save_match_result("https://www.zhipin.com/job_detail/1.html", result)
    loaded = storage.get_match_result("https://www.zhipin.com/job_detail/1.html")

    assert loaded is not None
    assert loaded.score == 90
```

- [ ] **Step 2: Write failing apply queue tests**

Create `apps/local-service/tests/test_apply_queue.py`:

```python
from datetime import datetime, timezone

from job_apply_assistant.apply_queue import ApplyQueue
from job_apply_assistant.models import ApplyTask, JobPosting, MatchResult, SearchPreference


def make_task() -> ApplyTask:
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/1.html",
        title="机器人软件工程师",
        companyName="示例科技",
        city="上海",
        salaryText="25-40K",
        description="ROS Python",
    )
    match = MatchResult(
        passedHardFilters=True,
        hardFilterReasons=[],
        score=90,
        reasons=["匹配"],
        risks=[],
        greeting="您好，期待沟通。",
        shouldQueue=True,
    )
    return ApplyTask.create(job=job, match=match, greeting=match.greeting)


def make_preference() -> SearchPreference:
    return SearchPreference(
        targetCities=["上海"],
        keywords=["机器人"],
        salaryMinK=20,
        salaryMaxK=45,
        blockedCompanies=[],
        blockedIndustries=[],
        recencyDays=7,
        requireActiveBoss=True,
        matchThreshold=80,
        dailyLimit=1,
        applyWindowStart="09:00",
        applyWindowEnd="18:00",
        intervalMinSeconds=60,
        intervalMaxSeconds=120,
    )


def test_queue_returns_next_task_inside_window() -> None:
    queue = ApplyQueue()
    task = make_task()
    queue.enqueue(task)

    next_task = queue.next_task(make_preference(), now=datetime(2026, 6, 6, 10, 0, tzinfo=timezone.utc))

    assert next_task is not None
    assert next_task.status == "applying"


def test_queue_pauses_after_daily_limit() -> None:
    queue = ApplyQueue()
    queue.mark_applied(make_task())
    queue.enqueue(make_task())

    next_task = queue.next_task(make_preference(), now=datetime(2026, 6, 6, 10, 0, tzinfo=timezone.utc))

    assert next_task is None
    assert queue.pause_reason == "达到每日上限"
```

- [ ] **Step 3: Run storage and queue tests and verify failure**

Run: `cd apps/local-service && python -m pytest tests/test_storage.py tests/test_apply_queue.py -q`

Expected: FAIL because `storage.py` and `apply_queue.py` do not exist.

- [ ] **Step 4: Implement SQLite storage**

Create `apps/local-service/job_apply_assistant/storage.py`:

```python
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from job_apply_assistant.models import MatchResult


class Storage:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    def initialize(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.db_path) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS match_results (
                  job_url TEXT PRIMARY KEY,
                  payload TEXT NOT NULL,
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

    def save_match_result(self, job_url: str, result: MatchResult) -> None:
        payload = result.model_dump_json(by_alias=True)
        with sqlite3.connect(self.db_path) as connection:
            connection.execute(
                "INSERT OR REPLACE INTO match_results (job_url, payload) VALUES (?, ?)",
                (job_url, payload),
            )

    def get_match_result(self, job_url: str) -> MatchResult | None:
        with sqlite3.connect(self.db_path) as connection:
            row = connection.execute(
                "SELECT payload FROM match_results WHERE job_url = ?",
                (job_url,),
            ).fetchone()
        if row is None:
            return None
        return MatchResult.model_validate(json.loads(row[0]))
```

- [ ] **Step 5: Implement apply queue**

Create `apps/local-service/job_apply_assistant/apply_queue.py`:

```python
from __future__ import annotations

from datetime import datetime

from job_apply_assistant.models import ApplyTask, SearchPreference, utc_now_iso


class ApplyQueue:
    def __init__(self) -> None:
        self.tasks: list[ApplyTask] = []
        self.applied_today = 0
        self.pause_reason: str | None = None

    def enqueue(self, task: ApplyTask) -> None:
        if all(existing.job.url != task.job.url for existing in self.tasks):
            self.tasks.append(task)

    def next_task(self, preference: SearchPreference, now: datetime) -> ApplyTask | None:
        self.pause_reason = None
        if self.applied_today >= preference.daily_limit:
            self.pause_reason = "达到每日上限"
            return None
        if not self._inside_window(preference, now):
            self.pause_reason = "当前时间不在投递时间段"
            return None
        for task in self.tasks:
            if task.status == "queued":
                task.status = "applying"
                task.updated_at = utc_now_iso()
                return task
        return None

    def mark_applied(self, task: ApplyTask) -> None:
        task.status = "applied"
        task.applied_at = utc_now_iso()
        task.updated_at = utc_now_iso()
        self.applied_today += 1

    def mark_manual_action(self, task: ApplyTask, reason: str) -> None:
        task.status = "needs_manual_action"
        task.failure_reason = reason
        task.updated_at = utc_now_iso()
        self.pause_reason = reason

    def _inside_window(self, preference: SearchPreference, now: datetime) -> bool:
        current = now.strftime("%H:%M")
        return preference.apply_window_start <= current <= preference.apply_window_end
```

- [ ] **Step 6: Run storage and queue tests**

Run: `cd apps/local-service && python -m pytest tests/test_storage.py tests/test_apply_queue.py -q`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/local-service
git commit -m "feat(local-service): persist matches and manage apply queue"
```

---

### Task 7: FastAPI Local Service

**Files:**
- Create: `apps/local-service/tests/test_api.py`
- Create: `apps/local-service/job_apply_assistant/api.py`
- Create: `apps/local-service/job_apply_assistant/main.py`

- [ ] **Step 1: Write failing API tests**

Create `apps/local-service/tests/test_api.py`:

```python
from fastapi.testclient import TestClient

from job_apply_assistant.main import create_app


def test_health_endpoint() -> None:
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "job-apply-assistant-local-service"}


def test_match_endpoint_rejects_missing_ai_config() -> None:
    client = TestClient(create_app())

    response = client.post(
        "/match",
        json={
            "job": {
                "source": "boss",
                "url": "https://www.zhipin.com/job_detail/1.html",
                "title": "机器人软件工程师",
                "companyName": "示例科技",
                "city": "上海",
                "salaryText": "25-40K",
                "description": "ROS Python",
            },
            "resume": {
                "id": "resume_1",
                "fileName": "resume.pdf",
                "rawText": "ROS Python 机器人",
                "summary": "ROS Python",
                "skills": ["ROS", "Python"],
                "yearsOfExperience": 3,
                "projectHighlights": ["机器人项目"],
                "education": ["本科"],
                "targetRoleSuggestions": ["机器人软件工程师"],
            },
            "preference": {
                "targetCities": ["上海"],
                "keywords": ["机器人"],
                "salaryMinK": 20,
                "salaryMaxK": 45,
                "blockedCompanies": [],
                "blockedIndustries": [],
                "recencyDays": 7,
                "requireActiveBoss": True,
                "matchThreshold": 80,
                "dailyLimit": 20,
                "applyWindowStart": "09:30",
                "applyWindowEnd": "18:30",
                "intervalMinSeconds": 90,
                "intervalMaxSeconds": 240,
            },
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "AI config is not set"
```

- [ ] **Step 2: Run API tests and verify failure**

Run: `cd apps/local-service && python -m pytest tests/test_api.py -q`

Expected: FAIL because `main.py` and `api.py` do not exist.

- [ ] **Step 3: Implement FastAPI routes**

Create `apps/local-service/job_apply_assistant/api.py`:

```python
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from job_apply_assistant.ai_client import AIClient, AIConfig
from job_apply_assistant.matching import MatchingService
from job_apply_assistant.models import JobPosting, MatchResult, ResumeProfile, SearchPreference


class MatchRequest(BaseModel):
    job: JobPosting
    resume: ResumeProfile
    preference: SearchPreference
    ai_config: AIConfig | None = None


router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "job-apply-assistant-local-service"}


@router.post("/match", response_model=MatchResult)
async def match_job(request: MatchRequest) -> MatchResult:
    if request.ai_config is None:
        raise HTTPException(status_code=400, detail="AI config is not set")
    service = MatchingService(AIClient(request.ai_config))
    return await service.match(request.job, request.resume, request.preference)
```

Create `apps/local-service/job_apply_assistant/main.py`:

```python
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from job_apply_assistant.api import router


def create_app() -> FastAPI:
    app = FastAPI(title="Job Apply Assistant Local Service")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["chrome-extension://*", "http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    return app


app = create_app()
```

- [ ] **Step 4: Run API tests**

Run: `cd apps/local-service && python -m pytest tests/test_api.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/local-service
git commit -m "feat(local-service): expose health and match APIs"
```

---

### Task 8: Extension Local API Client And Manifest

**Files:**
- Create: `apps/extension/src/shared/localApiClient.test.ts`
- Create: `apps/extension/src/shared/localApiClient.ts`
- Create: `apps/extension/src/shared/types.ts`
- Create: `apps/extension/manifest.config.ts`
- Modify: `apps/extension/vite.config.ts`

- [ ] **Step 1: Write failing local API client tests**

Create `apps/extension/src/shared/localApiClient.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { LocalApiClient } from "./localApiClient";

describe("LocalApiClient", () => {
  it("checks local service health", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok", service: "job-apply-assistant-local-service" }),
    });
    const client = new LocalApiClient("http://127.0.0.1:8765", fetchMock);

    await expect(client.health()).resolves.toEqual({
      status: "ok",
      service: "job-apply-assistant-local-service",
    });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8765/health");
  });

  it("throws a readable error when service is unavailable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    const client = new LocalApiClient("http://127.0.0.1:8765", fetchMock);

    await expect(client.health()).rejects.toThrow("Local service unavailable");
  });
});
```

- [ ] **Step 2: Run extension tests and verify failure**

Run: `npm --workspace apps/extension test -- src/shared/localApiClient.test.ts`

Expected: FAIL because `localApiClient.ts` does not exist.

- [ ] **Step 3: Implement local API client**

Create `apps/extension/src/shared/localApiClient.ts`:

```ts
type FetchLike = typeof fetch;

export interface HealthResponse {
  status: "ok";
  service: "job-apply-assistant-local-service";
}

export class LocalApiClient {
  constructor(
    private readonly baseUrl = "http://127.0.0.1:8765",
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async health(): Promise<HealthResponse> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/health`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return (await response.json()) as HealthResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Local service unavailable: ${message}`);
    }
  }
}
```

Create `apps/extension/src/shared/types.ts`:

```ts
export type AutomationStatus = "idle" | "scanning" | "matching" | "applying" | "paused" | "error";

export interface RuntimeState {
  status: AutomationStatus;
  serviceConnected: boolean;
  todayAppliedCount: number;
  pauseReason?: string;
}
```

- [ ] **Step 4: Create Manifest V3 config**

Create `apps/extension/manifest.config.ts`:

```ts
const manifest = {
  manifest_version: 3,
  name: "Boss 求职助手",
  version: "0.1.0",
  description: "根据简历匹配 Boss 直聘岗位，并执行可控自动投递。",
  permissions: ["storage", "activeTab", "scripting"],
  host_permissions: ["https://www.zhipin.com/*", "http://127.0.0.1/*"],
  action: {
    default_popup: "popup.html",
  },
  background: {
    service_worker: "src/background/main.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["https://www.zhipin.com/*"],
      js: ["src/content/main.tsx"],
      run_at: "document_idle",
    },
  ],
  options_page: "index.html",
} as const;

export default manifest;
```

Replace `apps/extension/vite.config.ts` with:

```ts
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

- [ ] **Step 5: Run extension tests**

Run: `npm --workspace apps/extension test -- src/shared/localApiClient.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/extension
git commit -m "feat(extension): add local service client and manifest contract"
```

---

### Task 9: Boss DOM Adapter With Fixtures

**Files:**
- Create: `apps/extension/src/content/fixtures/boss-list.html`
- Create: `apps/extension/src/content/bossAdapter.test.ts`
- Create: `apps/extension/src/content/bossAdapter.ts`

- [ ] **Step 1: Create Boss HTML fixture**

Create `apps/extension/src/content/fixtures/boss-list.html`:

```html
<main>
  <section class="job-card-wrapper">
    <a class="job-card-left" href="/job_detail/abc.html">
      <span class="job-name">机器人软件工程师</span>
      <span class="job-area">上海</span>
      <span class="salary">25-40K</span>
    </a>
    <div class="company-name">示例科技</div>
    <ul class="tag-list">
      <li>3-5年</li>
      <li>本科</li>
    </ul>
    <div class="boss-online-tag">刚刚活跃</div>
    <p class="job-desc">负责 ROS、Python、机器人控制相关开发。</p>
  </section>
</main>
```

- [ ] **Step 2: Write failing adapter tests**

Create `apps/extension/src/content/bossAdapter.test.ts`:

```ts
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
});
```

- [ ] **Step 3: Run adapter tests and verify failure**

Run: `npm --workspace apps/extension test -- src/content/bossAdapter.test.ts`

Expected: FAIL because `bossAdapter.ts` does not exist.

- [ ] **Step 4: Implement Boss adapter**

Create `apps/extension/src/content/bossAdapter.ts`:

```ts
import { JobPosting, JobPostingSchema } from "@job-apply-assistant/shared-schema";

const BOSS_ORIGIN = "https://www.zhipin.com";

function text(root: ParentNode, selector: string): string | undefined {
  return root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() || undefined;
}

function absoluteBossUrl(href: string): string {
  return new URL(href, BOSS_ORIGIN).toString();
}

export class BossAdapter {
  constructor(private readonly doc: Document) {}

  extractListJobs(): JobPosting[] {
    const cards = Array.from(this.doc.querySelectorAll(".job-card-wrapper"));
    return cards.map((card) => this.extractCard(card)).filter((job): job is JobPosting => job !== null);
  }

  private extractCard(card: Element): JobPosting | null {
    const link = card.querySelector<HTMLAnchorElement>(".job-card-left");
    const title = text(card, ".job-name");
    const city = text(card, ".job-area");
    const salaryText = text(card, ".salary");
    const companyName = text(card, ".company-name");
    const tags = Array.from(card.querySelectorAll(".tag-list li")).map((item) =>
      item.textContent?.replace(/\s+/g, " ").trim(),
    );
    const description = text(card, ".job-desc") ?? title;

    if (!link?.href || !title || !city || !salaryText || !companyName || !description) {
      return null;
    }

    return JobPostingSchema.parse({
      source: "boss",
      url: absoluteBossUrl(link.getAttribute("href") ?? link.href),
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
  }

  detectBlockingCondition(): string | null {
    const pageText = this.doc.body.textContent ?? "";
    if (pageText.includes("验证码") || pageText.includes("人机验证")) return "遇到验证码或人机验证";
    if (pageText.includes("登录") && pageText.includes("扫码")) return "登录状态失效";
    if (pageText.includes("账号异常")) return "账号异常提示";
    return null;
  }
}
```

- [ ] **Step 5: Run adapter tests**

Run: `npm --workspace apps/extension test -- src/content/bossAdapter.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/extension/src/content packages/shared-schema
git commit -m "feat(extension): extract Boss job cards"
```

---

### Task 10: Automation Controller

**Files:**
- Create: `apps/extension/src/background/automationController.test.ts`
- Create: `apps/extension/src/background/automationController.ts`
- Create: `apps/extension/src/background/main.ts`

- [ ] **Step 1: Write failing automation controller tests**

Create `apps/extension/src/background/automationController.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { AutomationController } from "./automationController";

describe("AutomationController", () => {
  it("pauses when the adapter detects a blocking condition", async () => {
    const controller = new AutomationController({
      extractJobs: () => [],
      detectBlockingCondition: () => "遇到验证码或人机验证",
      matchJob: vi.fn(),
    });

    const state = await controller.scanAndMatch();

    expect(state.status).toBe("paused");
    expect(state.pauseReason).toBe("遇到验证码或人机验证");
  });

  it("matches extracted jobs when page is usable", async () => {
    const matchJob = vi.fn().mockResolvedValue({ shouldQueue: true, score: 90 });
    const controller = new AutomationController({
      extractJobs: () => [
        {
          source: "boss",
          url: "https://www.zhipin.com/job_detail/1.html",
          title: "机器人软件工程师",
          companyName: "示例科技",
          city: "上海",
          salaryText: "25-40K",
          description: "ROS Python",
        },
      ],
      detectBlockingCondition: () => null,
      matchJob,
    });

    const state = await controller.scanAndMatch();

    expect(state.status).toBe("idle");
    expect(state.matchedCount).toBe(1);
    expect(matchJob).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run automation tests and verify failure**

Run: `npm --workspace apps/extension test -- src/background/automationController.test.ts`

Expected: FAIL because `automationController.ts` does not exist.

- [ ] **Step 3: Implement automation controller**

Create `apps/extension/src/background/automationController.ts`:

```ts
import { JobPosting } from "@job-apply-assistant/shared-schema";

export interface AutomationDependencies {
  extractJobs: () => JobPosting[];
  detectBlockingCondition: () => string | null;
  matchJob: (job: JobPosting) => Promise<unknown>;
}

export interface AutomationControllerState {
  status: "idle" | "scanning" | "matching" | "paused" | "error";
  pauseReason?: string;
  matchedCount: number;
}

export class AutomationController {
  constructor(private readonly deps: AutomationDependencies) {}

  async scanAndMatch(): Promise<AutomationControllerState> {
    const blockingCondition = this.deps.detectBlockingCondition();
    if (blockingCondition) {
      return { status: "paused", pauseReason: blockingCondition, matchedCount: 0 };
    }

    const jobs = this.deps.extractJobs();
    let matchedCount = 0;
    for (const job of jobs) {
      await this.deps.matchJob(job);
      matchedCount += 1;
    }

    return { status: "idle", matchedCount };
  }
}
```

Create `apps/extension/src/background/main.ts`:

```ts
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    runtimeState: {
      status: "idle",
      serviceConnected: false,
      todayAppliedCount: 0,
    },
  });
});
```

- [ ] **Step 4: Run automation tests**

Run: `npm --workspace apps/extension test -- src/background/automationController.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/extension/src/background
git commit -m "feat(extension): add automation pause controller"
```

---

### Task 11: Minimal Dashboard, Popup, And Floating Panel

**Files:**
- Create: `apps/extension/src/dashboard/main.tsx`
- Create: `apps/extension/src/dashboard/App.tsx`
- Create: `apps/extension/popup.html`
- Create: `apps/extension/src/popup/main.tsx`
- Create: `apps/extension/src/popup/Popup.tsx`
- Create: `apps/extension/src/content/main.tsx`
- Create: `apps/extension/src/content/FloatingPanel.tsx`
- Create: `apps/extension/src/dashboard/App.test.tsx`

- [ ] **Step 1: Write failing Dashboard test**

Create `apps/extension/src/dashboard/App.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Add test dependency**

Modify `apps/extension/package.json` devDependencies to include:

```json
"@testing-library/react": "^16.1.0"
```

- [ ] **Step 3: Run Dashboard test and verify failure**

Run: `npm --workspace apps/extension test -- src/dashboard/App.test.tsx`

Expected: FAIL because `App.tsx` does not exist.

- [ ] **Step 4: Implement Dashboard**

Create `apps/extension/src/dashboard/App.tsx`:

```tsx
const sections = ["简历", "AI 配置", "求职目标", "投递队列", "日志"];

export function App() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>Boss 求职助手</h1>
      <nav style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {sections.map((section) => (
          <button key={section} type="button">
            {section}
          </button>
        ))}
      </nav>
      <section>
        <h2>简历</h2>
        <p>导入 PDF/DOCX 简历，解析后用于岗位匹配。</p>
      </section>
      <section>
        <h2>AI 配置</h2>
        <p>配置 OpenAI-compatible base_url、api_key 和 model。</p>
      </section>
      <section>
        <h2>求职目标</h2>
        <p>确认城市、薪资、关键词、黑名单和投递节奏。</p>
      </section>
      <section>
        <h2>投递队列</h2>
        <p>查看待投递、已投递、需人工处理和失败任务。</p>
      </section>
      <section>
        <h2>日志</h2>
        <p>查看匹配原因、过滤原因、异常原因和暂停记录。</p>
      </section>
    </main>
  );
}
```

Create `apps/extension/src/dashboard/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
```

- [ ] **Step 5: Implement Popup and Floating Panel**

Create `apps/extension/popup.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Boss 求职助手</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/popup/main.tsx"></script>
  </body>
</html>
```

Create `apps/extension/src/popup/Popup.tsx`:

```tsx
export function Popup() {
  return (
    <main style={{ minWidth: 280, padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1>Boss 求职助手</h1>
      <p>本地服务：未连接</p>
      <p>今日投递：0</p>
      <button type="button">暂停</button>
    </main>
  );
}
```

Create `apps/extension/src/popup/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { Popup } from "./Popup";

createRoot(document.getElementById("root") as HTMLElement).render(<Popup />);
```

Create `apps/extension/src/content/FloatingPanel.tsx`:

```tsx
export function FloatingPanel() {
  return (
    <aside
      style={{
        position: "fixed",
        right: 16,
        top: 96,
        zIndex: 2147483647,
        width: 280,
        padding: 16,
        background: "#ffffff",
        color: "#111827",
        border: "1px solid #d1d5db",
        borderRadius: 8,
        boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <strong>Boss 求职助手</strong>
      <p>状态：待扫描</p>
      <button type="button">开始扫描</button>
      <button type="button">暂停</button>
    </aside>
  );
}
```

Create `apps/extension/src/content/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { FloatingPanel } from "./FloatingPanel";

const container = document.createElement("div");
container.id = "job-apply-assistant-floating-panel";
document.body.appendChild(container);

createRoot(container).render(<FloatingPanel />);
```

- [ ] **Step 6: Run Dashboard test**

Run: `npm --workspace apps/extension test -- src/dashboard/App.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/extension package-lock.json
git commit -m "feat(extension): add MVP user interfaces"
```

---

### Task 12: Integration Verification And User-Facing Runbook

**Files:**
- Create: `docs/dev-runbook.md`
- Modify: `README.md`
- Modify: `apps/local-service/pyproject.toml`
- Modify: `apps/extension/package.json`

- [ ] **Step 1: Write runbook**

Create `docs/dev-runbook.md`:

````markdown
# Development Runbook

## Local Service

Install test dependencies:

```bash
cd apps/local-service
python -m pip install -e ".[test]"
```

Run tests:

```bash
python -m pytest -q
```

Start service:

```bash
python -m uvicorn job_apply_assistant.main:app --host 127.0.0.1 --port 8765
```

Health check:

```bash
curl http://127.0.0.1:8765/health
```

Expected response:

```json
{"status":"ok","service":"job-apply-assistant-local-service"}
```

## Extension

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm --workspace apps/extension test
```

Build:

```bash
npm --workspace apps/extension build
```

Load the built extension from `apps/extension/dist` in Chrome or Edge developer mode.

## Manual Safety Check

Before testing on Boss 直聘:

- Confirm the local service is running on `127.0.0.1:8765`.
- Confirm the extension shows service health.
- Confirm daily limit and interval settings are conservative.
- Confirm pause works from the floating panel and Popup.
- Stop immediately if a captcha, login prompt, account warning, or unknown dialog appears.
````

- [ ] **Step 2: Update README**

Replace `README.md` with:

```markdown
# Boss 直聘自动求职助手

Chrome/Edge 扩展 + 本地 FastAPI 服务，用于根据 PDF/DOCX 简历匹配 Boss 直聘岗位，并执行可控的自动沟通/投递流程。

## Safety Boundary

- 只支持当前用户登录后可见的 Boss 直聘网页内容。
- 遇到验证码、人机验证、登录异常、账号异常、未知弹窗或页面结构未知时暂停。
- 不做验证码绕过、风控规避、浏览器指纹隐藏或无限制批量投递。

## Components

- `apps/extension`: Chrome/Edge Manifest V3 扩展。
- `apps/local-service`: 本地 FastAPI 服务。
- `packages/shared-schema`: TypeScript 数据契约。

## Development

See [docs/dev-runbook.md](docs/dev-runbook.md).
```

- [ ] **Step 3: Run all local-service tests**

Run: `cd apps/local-service && python -m pytest -q`

Expected: PASS.

- [ ] **Step 4: Run all workspace tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Run extension build**

Run: `npm --workspace apps/extension build`

Expected: PASS and create `apps/extension/dist`.

- [ ] **Step 6: Commit**

Run:

```bash
git add README.md docs/dev-runbook.md apps/local-service apps/extension package.json package-lock.json
git commit -m "docs: add development runbook"
```

---

## Final Verification

Run these commands before claiming the MVP foundation is complete:

```bash
git status --short
node --test tests/repo_layout.test.mjs
npm --workspace packages/shared-schema test
npm --workspace packages/shared-schema build
npm --workspace apps/extension test
npm --workspace apps/extension build
cd apps/local-service && python -m pytest -q
```

Expected:

- `git status --short` shows no uncommitted changes after the final commit.
- Repository layout test passes.
- Shared schema tests and build pass.
- Extension tests and build pass.
- Local service tests pass.

## Spec Coverage Review

- PDF/DOCX resume import: Task 4.
- OpenAI-compatible API: Task 5.
- Search preferences and hard filters: Tasks 3 and 5.
- Boss page scanning: Task 9.
- AI matching score and greeting: Task 5.
- Controlled apply queue and pause behavior: Tasks 6 and 10.
- Dashboard, Popup, floating panel: Task 11.
- Local service API: Task 7.
- SQLite persistence: Task 6.
- Safety boundaries and runbook: Task 12.
