#!/usr/bin/env node
/**
 * 开发用：在 Mac 上把 http://127.0.0.1:13026 转发到真实网关。
 * 当模拟器直连外网 IP:端口 失败时，App 里「API 基础地址」填 http://127.0.0.1:13026 可绕过。
 *
 * 用法（项目根目录）：
 *   node scripts/dev-api-proxy.mjs
 * 或：
 *   npm run dev:api-proxy
 *
 * 环境变量（可选）：
 *   DEV_API_PROXY_HOST / DEV_API_PROXY_PORT — 上游主机与端口
 *   DEV_API_PROXY_LOCAL_PORT — 本机监听端口，默认 13026
 */
import http from 'node:http';

const UPSTREAM_HOST = process.env.DEV_API_PROXY_HOST || '47.242.248.240';
const UPSTREAM_PORT = Number.parseInt(process.env.DEV_API_PROXY_PORT || '2026', 10);
const LOCAL_PORT = Number.parseInt(process.env.DEV_API_PROXY_LOCAL_PORT || '13026', 10);

const server = http.createServer((clientReq, clientRes) => {
  const headers = { ...clientReq.headers };
  headers.host = `${UPSTREAM_HOST}:${UPSTREAM_PORT}`;

  const proxyReq = http.request(
    {
      hostname: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      path: clientReq.url,
      method: clientReq.method,
      headers,
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(clientRes);
    }
  );

  proxyReq.on('error', (err) => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    clientRes.end(`代理无法连接上游 http://${UPSTREAM_HOST}:${UPSTREAM_PORT}\n${err.message}\n`);
  });

  clientReq.pipe(proxyReq);
});

server.listen(LOCAL_PORT, '127.0.0.1', () => {
  console.log(`[dev-api-proxy] 监听 http://127.0.0.1:${LOCAL_PORT} → http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`);
  console.log('请在 App 开发页「API 基础地址」保存为：http://127.0.0.1:' + LOCAL_PORT);
});
