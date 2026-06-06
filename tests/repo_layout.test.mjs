import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

test("repository has the MVP monorepo layout", () => {
  const requiredPaths = [
    ".gitignore",
    "README.md",
    "package.json",
    "apps/extension/package.json",
    "apps/extension/tsconfig.json",
    "apps/extension/vite.config.ts",
    "apps/extension/index.html",
    "apps/local-service/pyproject.toml",
    "apps/local-service/job_apply_assistant/__init__.py",
    "apps/local-service/tests/__init__.py",
    "packages/shared-schema",
    "packages/shared-schema/package.json",
    "packages/shared-schema/src/.gitkeep",
    "docs/superpowers/specs/2026-06-06-boss-job-apply-assistant-design.md",
  ];

  for (const path of requiredPaths) {
    assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
  }
});

test("local scoped dependencies resolve to declared workspace packages", () => {
  const rootPackage = readJson("package.json");
  const workspacePackageNames = new Set();

  for (const workspace of rootPackage.workspaces) {
    const packageJsonPath = `${workspace}/package.json`;
    assert.equal(existsSync(join(root, packageJsonPath)), true, `${packageJsonPath} should exist`);
    workspacePackageNames.add(readJson(packageJsonPath).name);
  }

  for (const workspace of rootPackage.workspaces) {
    const packageJson = readJson(`${workspace}/package.json`);
    const dependencyNames = Object.keys({
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
      ...packageJson.peerDependencies,
      ...packageJson.optionalDependencies,
    });

    for (const dependencyName of dependencyNames) {
      if (dependencyName.startsWith("@job-apply-assistant/")) {
        assert.equal(
          workspacePackageNames.has(dependencyName),
          true,
          `${dependencyName} should resolve to a declared local workspace package`,
        );
      }
    }
  }
});
