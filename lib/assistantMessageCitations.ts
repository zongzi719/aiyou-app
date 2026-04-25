/**
 * 助手消息 Markdown 预处理：
 * - 去掉 `citation:` 等前缀；
 * - 全角 `［］（）` → 半角，避免 `[text](url)` 无法被解析；
 * - 若模型少打了开头的 `[`（如「百度健康](https://…」），在标签前补上 `[`；
 * - 修复「上一行行尾 `[` + 换行 + `[来源](https」」导致的孤 `[` 与 `[[`；
 * - 合并 `](` 到首个 `)` 之间被换行/空白打断的 `http` URL；
 * - 去掉 `[来源](https` 前的换行，避免被解析成新段落而「单独一行」；
 * - 相邻 http 引用 `[a](…)[b](…)` 之间补一个空格，药丸不贴在一起。
 */

function stripCitationPrefixes(s: string): string {
  return s.replace(/citation\s*[：:]\s*/gi, ' ');
}

function normalizeFullWidthBracketPunctuation(s: string): string {
  return s
    .replace(/［/g, '[')
    .replace(/］/g, ']')
    .replace(/（/g, '(')
    .replace(/）/g, ')');
}

/** 来源名 / 引题里允许的字符；遇到括号、点号句号等会停止，以免吞掉正文。 */
function isSourceTitleChar(c: string): boolean {
  if (c.length === 0) return false;
  if (c === '\n' || c === '\r' || c === ']' || c === '[') return false;
  if (c === '。' || c === '，' || c === '、' || c === '；' || c === '！' || c === '？') {
    return false;
  }
  if (c === '!' || c === '?' || c === ',') return false;
  if (c === ')' || c === '（' || c === '(') return false;
  if (c === '-' || c === '·' || c === ' ' || c === '　') return true;
  const code = c.charCodeAt(0);
  if (code >= 0x4e00 && code <= 0x9fff) return true;
  if (code === 0x2e) return true; // .
  if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) return true;
  if (code >= 0x30 && code <= 0x39) return true;
  return false;
}

/**
 * 将模型偶发输出的「有来医生](https://...」补成「[有来医生](https://...」
 * 否则 Markdown 不识别为 link，会整段露出 URL；合法「[标题](https」左侧已有 `[` 的不会改。
 */
function addMissingOpenBracketForHttpLabelLinks(s: string): string {
  let b = s;
  let searchFrom = 0;
  let safety = 0;
  const maxSweeps = 400;
  while (safety < maxSweeps) {
    safety += 1;
    const j = b.indexOf('](', searchFrom);
    if (j < 0) break;
    if (j === 0) {
      searchFrom = 2;
      continue;
    }
    let p = j + 2;
    while (p < b.length && /[\s\u00a0\u200b]/.test(b[p]!)) p += 1;
    if (!/^https?:\/\//i.test(b.slice(p, p + 8))) {
      searchFrom = j + 1;
      continue;
    }
    const rb = j; // 此处是 `]`
    let t = rb - 1;
    while (t >= 0 && isSourceTitleChar(b[t]!)) t -= 1;
    if (t >= 0 && b[t]! === '[') {
      searchFrom = j + 1;
      continue;
    }
    const labelStart = t + 1;
    if (labelStart >= rb) {
      searchFrom = j + 1;
      continue;
    }
    b = `${b.slice(0, labelStart)}[${b.slice(labelStart)}`;
    searchFrom = labelStart + 1;
  }
  return b;
}

/**
 * 去掉「来源](https」补全后多出来的孤立 `[`：换行 / 空格 / 顿号后的 `[` 若紧接 `[标题](https` 则删掉前一个 `[`。
 */
function removeOrphanOpenBracketBeforeHttpMarkdownLink(s: string): string {
  let t = s.replace(/\[\s*\r?\n\s*(?=\[[^\]]{1,500}\]\(https?:\/\/)/g, '\n');
  t = t.replace(/\[\s+(?=\[[^\]]{1,500}\]\(https?:\/\/)/g, '');
  t = t.replace(/、\[\s*(?=\[[^\]]{1,500}\]\(https?:\/\/)/g, '、');
  return t;
}

/**
 * 同一行出现 `[[维基百科](https` 时去掉多余的前一个 `[`（常见于孤 `[` 与补全叠加）。
 */
function dedupeDoubleOpenBracketBeforeHttpLink(s: string): string {
  let out = s;
  for (let k = 0; k < 8; k += 1) {
    const next = out.replace(/\[(?=\[[^\]]{1,500}\]\(https?:\/\/)/g, '');
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * 将 `[label](` 后紧跟 `https?://` 的片段在首个 `)` 前合并为单行（去掉换行/多余空白），便于 markdown 解析为链接。
 */
function collapseWhitespaceInHttpMarkdownLinks(s: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const j = s.indexOf('](', i);
    if (j < 0) {
      out.push(s.slice(i));
      break;
    }
    let p = j + 2;
    while (p < s.length && /[\s\u00a0\u200b]/.test(s[p])) {
      p += 1;
    }
    const rest = s.slice(p);
    if (rest.length < 7 || !/^https?:\/\//i.test(rest)) {
      const close = s.indexOf(')', p);
      if (close < 0) {
        out.push(s.slice(i));
        break;
      }
      out.push(s.slice(i, close + 1));
      i = close + 1;
      continue;
    }
    out.push(s.slice(i, p));
    const from = p;
    let u = p;
    let foundClose = false;
    while (u < s.length) {
      if (s[u] === ')' && u > from) {
        const raw = s.slice(from, u);
        const urlClean = raw
          .replace(/[\n\r\t\u00a0\u200b]+/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
        out.push(urlClean);
        out.push(')');
        i = u + 1;
        foundClose = true;
        break;
      }
      u += 1;
    }
    if (foundClose) {
      continue;
    }
    out.push(s.slice(i));
    break;
  }
  return out.join('');
}

/**
 * 模型常在引用前换行；markdown-it 会把「换行 + [标题](https」拆成新段落，药丸会单独成行。
 * 去掉 http 引用链接前的换行与行首空白，让链接与上一段正文同一行。
 * 若上一行是 Markdown 标题（# …），不合并，避免破坏标题解析。
 */
function joinNewlinesBeforeHttpMarkdownLinks(s: string): string {
  const re = /\r?\n+\s*(\[[^\]]{1,500}\](?:\s*)\(https?:\/\/)/g;
  return s.replace(re, (match, linkPart: string, offset: number) => {
    const before = s.slice(0, offset);
    const lastNl = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r'));
    const line = before.slice(lastNl + 1);
    if (/^\s{0,3}#{1,6}(\s|$)/.test(line)) {
      return match;
    }
    return linkPart;
  });
}

/**
 * `[来源1](https…)[来源2](https…)` 紧挨时，RN 里两个 link 药丸会贴在一起；在 `)` 与下一条 `[` 之间补空格。
 */
function ensureSpaceBetweenAdjacentHttpMarkdownLinks(s: string): string {
  return s.replace(/\)(?!\s)(?=\[[^\]]{1,500}\]\(https?:\/\/)/g, ') ');
}

function compressVerticalWhitespace(s: string): string {
  return s.replace(/\n{3,}/g, '\n\n');
}

type AstNodeLike = {
  type?: string;
  content?: string;
  children?: AstNodeLike[];
} | null;

/**
 * 从 `react-native-markdown-display` 解析出的 link 节点中取出纯文本，用于与 href 比较后决定短标签/域名回退显示。
 */
function collectAstPlainText(node: AstNodeLike): string {
  if (node == null) {
    return '';
  }
  if (node.type === 'text' && typeof node.content === 'string') {
    return node.content;
  }
  if (Array.isArray(node.children)) {
    return node.children.map((c) => collectAstPlainText(c)).join('');
  }
  if (typeof node.content === 'string') {
    return node.content;
  }
  return '';
}

function hostnameOrFallback(href: string): string {
  try {
    const u = new URL(href);
    return u.hostname.replace(/^www\./, '') || '链接';
  } catch {
    return '链接';
  }
}

/**
 * 链接在 UI 中展示的标题：短标签用模型给的文案；若标签像 URL 或过长，用域名等短名。
 */
export function getAstLinkDisplayLabel(
  linkNode: { type?: string; content?: string; children?: unknown[]; attributes?: { href?: string } },
  href: string,
): string {
  const h = (href || '').trim();
  const t = collectAstPlainText(linkNode as AstNodeLike).trim();
  if (t) {
    if (/^https?:\/\//i.test(t) || t.length > 120) {
      return h ? hostnameOrFallback(h) : t;
    }
    return t;
  }
  return h ? hostnameOrFallback(h) : '链接';
}

/**
 * 助手主文 Markdown 的后处理（展示与复制可共用此结果）。
 */
export function formatAssistantMessageMarkdown(markdown: string): string {
  if (markdown == null || markdown === '') {
    return markdown;
  }
  let s = markdown;
  s = stripCitationPrefixes(s);
  s = normalizeFullWidthBracketPunctuation(s);
  s = addMissingOpenBracketForHttpLabelLinks(s);
  s = removeOrphanOpenBracketBeforeHttpMarkdownLink(s);
  s = dedupeDoubleOpenBracketBeforeHttpLink(s);
  s = collapseWhitespaceInHttpMarkdownLinks(s);
  s = joinNewlinesBeforeHttpMarkdownLinks(s);
  s = ensureSpaceBetweenAdjacentHttpMarkdownLinks(s);
  s = compressVerticalWhitespace(s);
  return s;
}
