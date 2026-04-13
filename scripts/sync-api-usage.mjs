/**
 * 扫描 app / lib / components / src（排除 src/dev）中对 mockApis 里各接口 path 的引用，
 * 生成 src/dev/data/apiUsageScan.generated.ts，供 /dev API 管理与页面预览展示「对接/引用」状态。
 *
 * 运行: node scripts/sync-api-usage.mjs
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const MOCK_APIS = join(root, 'src/dev/data/mockApis.ts');
const OUT = join(root, 'src/dev/data/apiUsageScan.generated.ts');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'ios', 'android', '.expo']);
const SKIP_FILE_SUBSTR = ['apiUsageScan.generated', 'mockApis.ts'];

function walk(dir, acc = []) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      const subRel = relative(root, p).replace(/\\/g, '/');
      if (subRel === 'src/dev' || subRel.startsWith('src/dev/')) continue;
      walk(p, acc);
    } else if (/\.(tsx?|jsx?)$/.test(name)) {
      const rel = relative(root, p).replace(/\\/g, '/');
      if (SKIP_FILE_SUBSTR.some((s) => rel.includes(s))) continue;
      if (rel.startsWith('src/dev/')) continue;
      acc.push(rel);
    }
  }
  return acc;
}

function extractIdPathPairs(content) {
  const pairs = [];
  const re =
    /id:\s*'([^']+)',\s*group:\s*'[^']*',\s*name:\s*'[^']*',\s*path:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(content))) {
    pairs.push({ id: m[1], path: m[2] });
  }
  return pairs;
}

/** 无 path 参数：整段字面量，且不能是更长路径的前缀（避免 /api/memory 命中 /api/memory/layered） */
function fileReferencesApiPath(fileContent, apiPath) {
  if (!apiPath.includes('{')) {
    const esc = apiPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${esc}(?!/[a-zA-Z0-9_{}-])`, 'g');
    return re.test(fileContent);
  }
  const staticParts = apiPath.split(/\{[^}]+\}/).filter((s) => s.length > 0);
  if (staticParts.length === 0) return false;
  let from = 0;
  for (const seg of staticParts) {
    const i = fileContent.indexOf(seg, from);
    if (i === -1) return false;
    from = i + seg.length;
  }
  return true;
}

function libModuleImportPattern(libRelPath) {
  const base = libRelPath.replace(/^.*\//, '').replace(/\.(tsx?|jsx?)$/, '');
  return new RegExp(`from\\s+['"\`]([^'"\`]*${base})['"\`]`, 'm');
}

function shouldPropagateLibImports(libRel) {
  if (libRel.startsWith('src/dev/')) return false;
  return libRel.startsWith('lib/') || libRel.startsWith('src/');
}

function propagateLibImporters(apiHits, allFiles, fileContents) {
  for (const files of Object.values(apiHits)) {
    const list = [...files];
    for (const lf of list) {
      if (!shouldPropagateLibImports(lf)) continue;
      const re = libModuleImportPattern(lf);
      for (const af of allFiles) {
        if (!af.startsWith('app/')) continue;
        const c = fileContents.get(af);
        if (c && re.test(c)) files.add(af);
      }
    }
  }
}

function main() {
  const mockText = readFileSync(MOCK_APIS, 'utf8');
  const pairs = extractIdPathPairs(mockText);
  if (pairs.length === 0) {
    console.error('No id/path pairs parsed from mockApis.ts — check file format.');
    process.exit(1);
  }

  const dirs = [join(root, 'app'), join(root, 'lib'), join(root, 'components'), join(root, 'src')].filter((d) => {
    try {
      return statSync(d).isDirectory();
    } catch {
      return false;
    }
  });

  const allFiles = [];
  for (const d of dirs) {
    walk(d, allFiles);
  }
  const uniqueFiles = [...new Set(allFiles)];

  const fileContents = new Map();
  for (const f of uniqueFiles) {
    try {
      fileContents.set(f, readFileSync(join(root, f), 'utf8'));
    } catch {
      /* skip */
    }
  }

  /** @type {Map<string, Set<string>>} */
  const apiHits = new Map();
  for (const { id } of pairs) {
    apiHits.set(id, new Set());
  }

  for (const { id, path } of pairs) {
    const set = apiHits.get(id);
    for (const f of uniqueFiles) {
      const c = fileContents.get(f);
      if (!c) continue;
      if (fileReferencesApiPath(c, path)) {
        set.add(f);
      }
    }
  }

  propagateLibImporters(apiHits, uniqueFiles, fileContents);

  const scanObj = {};
  for (const { id } of pairs) {
    scanObj[id] = { files: [...(apiHits.get(id) || [])].sort() };
  }

  const generatedAt = new Date().toISOString();
  const body = `/* eslint-disable prettier/prettier */
/**
 * 由 scripts/sync-api-usage.mjs 自动生成，请勿手改。
 * 生成时间: ${generatedAt}
 * 更新: npm run sync-api-usage
 */
export const apiUsageScanGeneratedAt = '${generatedAt}';

export type ApiUsageScanEntry = { files: string[] };

export const apiUsageScan: Record<string, ApiUsageScanEntry> = ${JSON.stringify(scanObj, null, 2)};
`;
  writeFileSync(OUT, body, 'utf8');
  console.log(`Wrote ${relative(root, OUT)} (${pairs.length} APIs, ${uniqueFiles.length} source files scanned).`);
}

main();
