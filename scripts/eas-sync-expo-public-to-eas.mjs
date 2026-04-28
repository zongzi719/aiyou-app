#!/usr/bin/env node
/**
 * 将根目录 .env 中的 EXPO_PUBLIC_* 同步到 EAS 指定环境（默认 production）。
 * 本地 npx expo start 会读 .env，但 EAS Build 在云端执行，不会带上被 gitignore 的 .env，
 * 必须在 EAS 中配置同名变量，打包时 Metro 才能内联进 iOS/Android 包。
 *
 * 用法：
 *   node scripts/eas-sync-expo-public-to-eas.mjs --dry-run    # 只打印将执行的命令（默认）
 *   node scripts/eas-sync-expo-public-to-eas.mjs --apply      # 真正执行（需已 eas login）
 *
 * 选项：
 *   --file .env          默认 .env
 *   --environment production|preview|development   默认 production
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');

function parseArgs(argv) {
  const out = { dryRun: true, file: '.env', environment: 'production' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') out.dryRun = false;
    if (a === '--dry-run') out.dryRun = true;
    if (a === '--file' && argv[i + 1]) {
      out.file = argv[++i];
    }
    if (a === '--environment' && argv[i + 1]) {
      out.environment = argv[++i];
    }
  }
  return out;
}

function parseDotenv(content) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key.startsWith('EXPO_PUBLIC_')) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function visibilityForKey(name) {
  const n = name.toLowerCase();
  if (
    n.includes('key') ||
    n.includes('secret') ||
    n.includes('token') ||
    n.includes('password') ||
    n.includes('app_id')
  ) {
    return 'sensitive';
  }
  return 'plaintext';
}

function runEas(args, dryRun) {
  const bin = 'npx';
  const full = ['--yes', 'eas-cli', ...args, '--non-interactive'];
  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log(`$ ${bin} ${full.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
    return 0;
  }
  const r = spawnSync(bin, full, { stdio: 'inherit', env: { ...process.env, FORCE_COLOR: '1' } });
  return r.status ?? 1;
}

const opts = parseArgs(process.argv.slice(2));
const envPath = resolve(ROOT, opts.file);
if (!existsSync(envPath)) {
  // eslint-disable-next-line no-console
  console.error(`找不到 ${opts.file}，请在项目根目录配置后再运行。`);
  process.exit(1);
}
const entries = Object.entries(parseDotenv(readFileSync(envPath, 'utf8'))).filter(([k, v]) => k && v !== undefined);
if (entries.length === 0) {
  // eslint-disable-next-line no-console
  console.error(`在 ${opts.file} 中未找到任何 EXPO_PUBLIC_* 行。`);
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(
  opts.dryRun
    ? `【dry-run】将同步 ${entries.length} 个变量到 EAS environment="${opts.environment}"\n`
    : `正在同步 ${entries.length} 个变量到 EAS environment="${opts.environment}" …\n`
);

/** 使用 `env:create --force`：无则创建、有则覆盖（与 eas env:update 相比少一步分支） */
let code = 0;
for (const [name, value] of entries) {
  const vis = visibilityForKey(name);
  const createArgs = [
    'env:create',
    '--name',
    name,
    '--value',
    value,
    '--environment',
    opts.environment,
    '--visibility',
    vis,
    '--force',
  ];
  const c = runEas(createArgs, opts.dryRun);
  if (!opts.dryRun && c !== 0) {
    code = 1;
  }
}

if (code !== 0) {
  // eslint-disable-next-line no-console
  console.error('部分 env:create 失败，请检查 eas login 与网络，或在 expo.dev 项目 Environment variables 中手工添加。');
  process.exit(code);
}
if (opts.dryRun) {
  // eslint-disable-next-line no-console
  console.log('\n以上为预览。确认无误后执行: node scripts/eas-sync-expo-public-to-eas.mjs --apply\n');
} else {
  // eslint-disable-next-line no-console
  console.log('\n已完成。请重新执行 EAS 打包，使新变量进入 iOS/Android 包。\n');
}
