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
