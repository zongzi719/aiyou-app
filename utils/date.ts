export function formatToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * ISO 8601 里日期与时间之间用字母 **T** 分隔（标准写法），例如 `2026-04-16T15:00`。
 * 若字符串可被 Date 解析，则格式化为 `YYYY-MM-DD HH:mm` 便于界面展示；否则原样返回（如自然语言时间）。
 */
export function formatScheduleTimeForDisplay(value: string | null | undefined): string {
  if (value == null || !String(value).trim()) return '';
  const s = String(value).trim();
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return s;
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}
