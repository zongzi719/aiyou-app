#!/usr/bin/env node
/**
 * 开发用：调用阿里云 nls-cloud-meta CreateToken，向本机 App 提供临时 Token。
 * 勿将 AccessKey 写入移动端；合并正式后端时替换为你们的签发服务即可。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RPCClient = require('@alicloud/pop-core');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadDotEnv();

const HOST = process.env.NLS_TOKEN_SERVER_HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.NLS_TOKEN_SERVER_PORT || '18765', 10);

const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
const accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
const appkey = process.env.ALIYUN_NLS_APPKEY || '';

async function createNlsToken() {
  if (!accessKeyId || !accessKeySecret) {
    throw new Error('缺少 ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET');
  }
  const client = new RPCClient({
    accessKeyId,
    accessKeySecret,
    endpoint: 'https://nls-meta.cn-shanghai.aliyuncs.com',
    apiVersion: '2019-02-28',
  });
  const res = await client.request('CreateToken', {}, { method: 'POST' });
  const tokenObj = res.Token;
  if (!tokenObj || !tokenObj.Id) {
    throw new Error(`CreateToken 响应异常: ${JSON.stringify(res)}`);
  }
  return {
    token: tokenObj.Id,
    expireTime: tokenObj.ExpireTime,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/nls/token') {
    try {
      const { token, expireTime } = await createNlsToken();
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(
        JSON.stringify({
          token,
          expireTime,
          appkey: appkey || undefined,
        })
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.writeHead(500, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found. GET /nls/token or /health');
});

server.listen(PORT, HOST, () => {
  console.log(`[aliyun-nls-token] http://${HOST}:${PORT}/nls/token`);
  if (!accessKeyId || !accessKeySecret) {
    console.warn('[aliyun-nls-token] 警告: 未配置 AccessKey，请在同目录 .env 中设置');
  }
});
