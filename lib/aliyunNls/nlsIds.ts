const HEX = '0123456789abcdef';

/** 阿里云文档要求 32 位随机 ID（十六进制字符串） */
export function nlsRandomId32(): string {
  let s = '';
  for (let i = 0; i < 32; i++) {
    s += HEX[Math.floor(Math.random() * 16)];
  }
  return s;
}
