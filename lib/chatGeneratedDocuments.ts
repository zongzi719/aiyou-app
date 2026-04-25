/**
 * 从助手 Markdown 中识别「生成的文档」路径（代码块、链接、裸路径、行内代码），
 * 用于卡片展示；正文里对应片段会被移除，避免重复显示路径。
 */

/** 去掉 thinking 围栏标签，得到正文（与 Conversation 等共用） */
export function parseThinkingBlocks(content: string): { thinking: string[]; main: string } {
  const thinking: string[] = [];
  const main = content
    .replace(/<thinking>([\s\S]*?)<\/thinking>/gi, (_, inner: string) => {
      const trimmed = inner.trim();
      if (trimmed) thinking.push(trimmed);
      return '';
    })
    .trim();
  return { thinking, main };
}

/** 同一报告在正文里可能出现 http/https、查询参数等略有差异的 URL，用于去重 */
export function normalizeDocumentDedupeKey(ref: string): string {
  const t = ref.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const path = u.pathname.replace(/\/$/, '');
      return `${u.origin.toLowerCase()}${path.toLowerCase()}`;
    } catch {
      return t.toLowerCase();
    }
  }
  return t.replace(/\\/g, '/').toLowerCase();
}

export type ParsedChatDocument = {
  /** 原始字符串（路径或 URL） */
  rawRef: string;
  /** 展示用文件名（无扩展名时可带扩展名） */
  displayName: string;
  ext: string;
  kindLabel: string;
};

const DOC_EXT_RE = /\.(md|markdown|pdf|docx?|txt)$/i;

function kindLabelForExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === 'pdf') return 'PDF';
  if (e === 'md' || e === 'markdown') return 'Markdown';
  if (e === 'doc' || e === 'docx') return 'Word';
  if (e === 'txt') return '文本';
  return '文档';
}

function fileNameFromPath(p: string): string {
  const clean = p.replace(/^file:\/\//, '').split(/[?#]/)[0] ?? p;
  const seg = clean.split(/[/\\]/).filter(Boolean).pop() ?? clean;
  return seg || p;
}

function pushUnique(docs: ParsedChatDocument[], seen: Set<string>, rawRef: string) {
  const ref = rawRef.trim();
  if (!ref) return;
  const key = normalizeDocumentDedupeKey(ref);
  if (!key || seen.has(key)) return;
  seen.add(key);
  const base = fileNameFromPath(ref);
  const extMatch = base.match(/\.([a-z0-9]+)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  const displayName = base.replace(/\.[^.]+$/, '') || base;
  docs.push({
    rawRef: ref,
    displayName,
    ext,
    kindLabel: kindLabelForExt(ext),
  });
}

function pathLooksLikeDocRef(t: string): boolean {
  const stem = (t.split(/[?#]/)[0] ?? t).trim();
  return DOC_EXT_RE.test(stem);
}

/**
 * @param mainMarkdown parseThinkingBlocks 之后的主体 Markdown
 */
export function stripGeneratedDocumentRefs(mainMarkdown: string): {
  displayMarkdown: string;
  documents: ParsedChatDocument[];
} {
  const documents: ParsedChatDocument[] = [];
  const seen = new Set<string>();
  let display = mainMarkdown;

  const tryDocLine = (line: string): boolean => {
    const t = line.trim();
    if (!pathLooksLikeDocRef(t)) return false;
    if (
      /^https?:\/\//i.test(t) ||
      /^file:\/\//i.test(t) ||
      t.startsWith('/') ||
      /^[a-z]:\\/i.test(t)
    ) {
      pushUnique(documents, seen, t);
      return true;
    }
    return false;
  };

  const stripFenceBlock = (inner: string): string | null => {
    const lines = inner
      .trim()
      .split('\n')
      .map((l: string) => l.trim())
      .filter(Boolean);
    if (lines.length === 1 && tryDocLine(lines[0]!)) return '\n\n';
    return null;
  };

  // 标准 ``` 围栏（首行后换行）
  display = display.replace(/```[^\n]*\n([\s\S]*?)```/g, (full, inner: string) => {
    const rep = stripFenceBlock(inner);
    return rep !== null ? rep : full;
  });

  // ~~~ 围栏（首行后换行）
  display = display.replace(/~~~[^\n]*\n([\s\S]*?)~~~/g, (full, inner: string) => {
    const rep = stripFenceBlock(inner);
    return rep !== null ? rep : full;
  });

  // 单行 ```/path/to/x.md```（模型偶发不写换行）
  display = display.replace(/```\s*([^\n]+?)\s*```/g, (full, inner: string) => {
    if (tryDocLine(inner)) return '\n\n';
    return full;
  });

  display = display.replace(/~~~\s*([^\n]+?)\s*~~~/g, (full, inner: string) => {
    if (tryDocLine(inner)) return '\n\n';
    return full;
  });

  display = display.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (full, _label: string, url: string) => {
    const u = url.trim();
    if (pathLooksLikeDocRef(u)) {
      pushUnique(documents, seen, u);
      return '';
    }
    return full;
  });

  display = display.replace(
    /(?:^|\n)(\/[^\n]+\.(?:md|markdown|pdf|docx?|txt))(?:\?[^\s]*)?\s*(?=\n|$)/gi,
    (_m, p: string) => {
      pushUnique(documents, seen, p.trim());
      return '\n';
    }
  );

  display = display.replace(
    /(?:^|\n)(https?:\/\/\S+?\.(?:md|markdown|pdf|docx?|txt))(?:\?[^\s]*)?\s*(?=\n|$)/gi,
    (_m, p: string) => {
      const u = p.trim();
      if (pathLooksLikeDocRef(u)) pushUnique(documents, seen, u);
      return '\n';
    }
  );

  // 行内 `.../file.md`（历史消息常见）
  display = display.replace(/`([^`\n]+)`/g, (full, inner: string) => {
    if (tryDocLine(inner)) return '';
    return full;
  });

  display = display
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .trim();

  const deduped: ParsedChatDocument[] = [];
  const seenOut = new Set<string>();
  for (const d of documents) {
    const k = normalizeDocumentDedupeKey(d.rawRef);
    if (!k || seenOut.has(k)) continue;
    seenOut.add(k);
    deduped.push(d);
  }

  return { displayMarkdown: display, documents: deduped };
}
