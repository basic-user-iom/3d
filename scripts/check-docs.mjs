#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const allowlistPath = path.join(repoRoot, 'docs', 'root-md-allowlist.json');

const fail = (message) => {
  console.error(`docs:check ❌ ${message}`);
  process.exit(1);
};

if (!fs.existsSync(allowlistPath)) {
  fail(`Missing allowlist at ${path.relative(repoRoot, allowlistPath)}`);
}

const raw = fs.readFileSync(allowlistPath, 'utf8');
let allowlist;
try {
  const parsed = JSON.parse(raw);
  const files = Array.isArray(parsed) ? parsed : parsed.allowedFiles;
  if (!Array.isArray(files)) {
    throw new Error('allowlist must be an array or an object with allowedFiles');
  }
  allowlist = new Set(files);
} catch (err) {
  fail(`Failed to parse allowlist JSON: ${err.message}`);
}

const readGitStatus = () => {
  try {
    const output = execSync('git status --porcelain', {
      cwd: repoRoot,
      encoding: 'utf8'
    });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (err) {
    console.warn('docs:check ⚠️  Unable to read git status, switching to warning-only mode.');
    return null;
  }
};

const gitStatusEntries = readGitStatus();
const gitStatusAvailable = Array.isArray(gitStatusEntries);
const deletedRoots = new Set();
const changedRoots = new Set();

const normalizeRootPath = (linePath) => {
  if (!linePath) {
    return null;
  }
  const arrowIndex = linePath.indexOf('->');
  if (arrowIndex !== -1) {
    // For rename entries we only care about the destination path.
    const target = linePath
      .slice(arrowIndex + 2)
      .trim()
      .replace(/^["']|["']$/g, '');
    return target || null;
  }
  return linePath.replace(/^["']|["']$/g, '');
};

if (gitStatusAvailable) {
  for (const entry of gitStatusEntries) {
    const status = entry.slice(0, 2);
    const rawPath = entry.slice(3);
    const candidate = normalizeRootPath(rawPath);
    if (!candidate || candidate.includes('/') || !candidate.toLowerCase().endsWith('.md')) {
      continue;
    }
    if (status.includes('D')) {
      deletedRoots.add(candidate);
      continue;
    }
    changedRoots.add(candidate);
  }
}

const rootFiles = fs
  .readdirSync(repoRoot, { withFileTypes: true })
  .filter((dirent) => dirent.isFile() && dirent.name.toLowerCase().endsWith('.md'))
  .map((dirent) => dirent.name);

const missingAllowlistEntries = [];
const disallowedFiles = [];
const disallowedChangedFiles = [];

for (const file of rootFiles) {
  if (!allowlist.has(file)) {
    disallowedFiles.push(file);
    if (changedRoots.has(file)) {
      disallowedChangedFiles.push(file);
    }
  }
}

for (const file of allowlist) {
  if (!rootFiles.includes(file) && !deletedRoots.has(file)) {
    missingAllowlistEntries.push(file);
  }
}

if (missingAllowlistEntries.length > 0) {
  console.warn(
    `docs:check ⚠️  Allowlist still references files no longer present:\n  - ${missingAllowlistEntries.join(
      '\n  - '
    )}\nUpdate docs/root-md-allowlist.json to remove them.`
  );
}

if (!gitStatusAvailable && disallowedFiles.length > 0) {
  console.warn(
    `docs:check ⚠️  Root-level Markdown backlog detected, but git status is unavailable so enforcement is skipped:\n  - ${disallowedFiles.join(
      '\n  - '
    )}\nUse docs/root-md-allowlist.json to document intentional exceptions and keep new docs under docs/.`
  );
}

if (gitStatusAvailable && disallowedChangedFiles.length > 0) {
  fail(
    `Found changed Markdown files in repo root that are not allow-listed:\n  - ${disallowedChangedFiles.join(
      '\n  - '
    )}\nMove them under docs/ or add their names to docs/root-md-allowlist.json.`
  );
}

if (gitStatusAvailable && disallowedFiles.length > 0) {
  console.warn(
    `docs:check ⚠️  Legacy root-level Markdown files still exist but were not changed in this diff:\n  - ${disallowedFiles.join(
      '\n  - '
    )}`
  );
}

console.log('docs:check ✅ Documentation placement checks passed.');


