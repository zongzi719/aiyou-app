# Web 端接入阿里云 NLS Token 服务

本文说明浏览器 / 前端工程如何调用本服务（`dev:nls-token` 部署的 HTTP 服务），获取临时 Token 并连接阿里云实时语音识别 WebSocket。与移动端逻辑一致：仅用 **基础 URL**（不含路径），客户端自行请求 `GET {baseUrl}/nls/token`。

## 1. 前置条件

- Token 服务已可访问（本机、内网或 HTTPS 域名均可）。
- 服务端已配置 `ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET`；可选 `ALIYUN_NLS_APPKEY`（会在 JSON 里一并返回给前端）。
- 浏览器需能访问 **Token 服务** 与 **阿里云网关** `wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1`（若你使用其它地域网关，请替换为对应地址）。

## 2. HTTP 接口

### 2.1 健康检查

- **方法 / 路径**：`GET /health`
- **响应**：`200`，body 为 JSON：`{ "ok": true }`

### 2.2 获取 NLS Token

- **方法 / 路径**：`GET /nls/token`
- **成功响应**：`200`，`Content-Type: application/json`

```json
{
  "token": "<临时 Token 字符串>",
  "expireTime": 1730000000,
  "appkey": "<可选，与服务端 .env 中 ALIYUN_NLS_APPKEY 一致>"
}
```

- **`expireTime`**：阿里云返回的过期时间，为 **Unix 时间戳（秒）**。缓存 Token 时建议换算为毫秒：`expiresAtMs = expireTime * 1000`，并在过期前（例如剩余不足 60 秒）重新拉取。
- **`appkey`**：若服务端未配置，该字段可能省略；Web 端需自行配置与阿里云控制台一致的 AppKey（与移动端 `EXPO_PUBLIC_ALIYUN_NLS_APPKEY` 相同含义）。

- **失败响应**：`500`，body 可能为 `{ "error": "错误说明" }`。

### 2.3 跨域（CORS）

本服务对 `/nls/token` 响应头包含 `Access-Control-Allow-Origin: *`，浏览器可直接 `fetch`（简单 GET，无自定义头时无需预检）。

## 3. 前端配置约定

定义一个 **仅含协议、主机、端口（及可选 path 前缀）** 的基础地址，**不要** 带末尾的 `/nls/token`：

| 示例 | 说明 |
|------|------|
| `http://127.0.0.1:18765` | 本地开发 |
| `https://your-domain.com` | 反代到 Node 端口后的公网地址 |

实际请求 URL 为：`${baseUrl.replace(/\/$/, '')}/nls/token`。

## 4. 拉取 Token（示例）

### 4.1 使用 fetch

```javascript
/**
 * @param {string} baseUrl 如 https://api.example.com 或 http://127.0.0.1:18765
 */
async function fetchNlsToken(baseUrl) {
  const url = `${baseUrl.replace(/\/$/, '')}/nls/token`;
  const r = await fetch(url);
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`Token 响应非 JSON: ${text.slice(0, 200)}`);
  }
  if (!r.ok) {
    throw new Error(j.error || `Token HTTP ${r.status}`);
  }
  if (j.error) {
    throw new Error(j.error);
  }
  if (!j.token || typeof j.token !== 'string') {
    throw new Error('响应缺少 token');
  }
  return {
    token: j.token,
    expireTime: typeof j.expireTime === 'number' ? j.expireTime : undefined,
    appkey: typeof j.appkey === 'string' ? j.appkey : undefined,
  };
}
```

### 4.2 简单缓存（与 Luna App 思路一致）

在 Token 仍有效时复用，减少对 `/nls/token` 的请求；若 `expireTime` 缺失，可退化为约 20 分钟本地过期（按你方策略调整）。

```javascript
function createCachedTokenGetter(baseUrl, fixedAppkey) {
  let cache = null; // { token, expiresAtMs }

  return async function getToken() {
    const now = Date.now();
    if (cache && cache.expiresAtMs > now + 60_000) {
      return cache.token;
    }
    const res = await fetchNlsToken(baseUrl);
    const exp =
      typeof res.expireTime === 'number'
        ? res.expireTime * 1000
        : now + 20 * 60_000;
    cache = { token: res.token, expiresAtMs: exp };
    return res.token;
  };
}
```

## 5. 连接阿里云实时识别（WebSocket）

浏览器原生支持 `WebSocket`。网关基础地址默认与仓库中移动端一致：

```text
wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1
```

1. 调用 `getToken()` 取得 `token`。
2. 拼接 URL（注意对 `token` 做编码）：

   ```javascript
   const gatewayWss = 'wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1';
   const token = await getToken();
   const wsUrl = `${gatewayWss.replace(/\/$/, '')}?token=${encodeURIComponent(token)}`;
   const ws = new WebSocket(wsUrl);
   ```

3. 在 `ws.onopen` 中发送 **StartTranscription** JSON（与 Luna `lib/aliyunNls/realtimeTranscriber.ts` 中结构一致），其中 `header.appkey` 为控制台 AppKey（来自接口返回的 `appkey` 或你方配置的常量），`header` 需包含 `message_id`、`task_id`、`namespace: 'SpeechTranscriber'`、`name: 'StartTranscription'` 等字段；`payload` 中至少包含 `format: 'pcm'`、`sample_rate: 16000` 等参数。
4. 收到 `TranscriptionStarted` 后，按协议向 WebSocket **发送二进制 PCM 帧**（16 kHz 等需与 payload 一致）；解析返回的 JSON 消息得到中间结果与句子结束事件。

完整信令与字段说明以 [阿里云智能语音交互 — 实时语音识别](https://help.aliyun.com/zh/isi/developer-reference/sdk-reference) 文档为准；实现细节可直接对照本仓库 `lib/aliyunNls/realtimeTranscriber.ts`。

## 6. 麦克风与音频（Web 特有）

- 使用 `navigator.mediaDevices.getUserMedia({ audio: true })` 取得音频流。
- 若直接发送 PCM：通常通过 `AudioContext` + `ScriptProcessorNode` 或 `AudioWorklet` 将输入转为 **16 kHz、单声道、s16le**，再按阿里云要求分包发送。
- 若使用 `MediaRecorder` 得到非 PCM 格式，需在客户端解码重采样或改用服务端转码（本 Token 服务不负责音频处理）。

## 7. 安全与上线建议

- **勿** 在 Web 前端配置阿里云 AccessKey；AccessKey 只应出现在 Token 服务所在服务器环境变量中。
- 公网暴露 `/nls/token` 时务必 **HTTPS**、并尽量增加 **鉴权**（Cookie / Header Token）、**IP 限制** 或仅内网访问；当前服务为开发向，无内置鉴权。
- 生产环境长期建议由**主业务后端**签发 Token 或走 STS，而不是单独依赖此最小示例服务。

## 8. 与 Luna 移动端的对应关系

| 移动端（Expo） | Web 端 |
|----------------|--------|
| `EXPO_PUBLIC_NLS_TOKEN_URL` | 与同名的「基础 URL」概念一致，可改为 `VITE_*` / `NEXT_PUBLIC_*` 等构建时变量 |
| `EXPO_PUBLIC_ALIYUN_NLS_APPKEY` | 同源 AppKey；若 `/nls/token` 返回 `appkey` 可优先使用返回值 |
| `EXPO_PUBLIC_ALIYUN_NLS_GATEWAY_WSS` | 默认同上 `wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1` |

仓库内移动端拉取逻辑可参考：`lib/aliyunNls/devToken.ts`、`lib/aliyunNls/realtimeTranscriber.ts`。
