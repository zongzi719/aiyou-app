#!/usr/bin/env node
/**
 * 最小验证：CreateToken → WebSocket StartTranscription → 发送静音 PCM 块 → StopTranscription。
 * 需本服务已启动且 .env 配置完整；ALIYUN_NLS_APPKEY 必填。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

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

const TOKEN_URL =
  process.env.NLS_TOKEN_VERIFY_URL || 'http://127.0.0.1:18765/nls/token';
const GATEWAY =
  process.env.NLS_GATEWAY_WSS || 'wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1';
const APPKEY = process.env.ALIYUN_NLS_APPKEY;

function randomId32() {
  const chars = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * 16)];
  return s;
}

function parseMessage(data) {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return null;
}

async function main() {
  if (!APPKEY) {
    console.error('请设置环境变量 ALIYUN_NLS_APPKEY');
    process.exit(1);
  }

  const tr = await fetch(TOKEN_URL);
  if (!tr.ok) {
    console.error('获取 token 失败', tr.status, await tr.text());
    process.exit(1);
  }
  const body = await tr.json();
  if (body.error) {
    console.error(body.error);
    process.exit(1);
  }
  const token = body.token;
  if (!token) {
    console.error('响应无 token', body);
    process.exit(1);
  }

  const taskId = randomId32();
  const url = `${GATEWAY}?token=${encodeURIComponent(token)}`;

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(url);

    ws.on('open', () => {
      const start = {
        header: {
          message_id: randomId32(),
          task_id: taskId,
          namespace: 'SpeechTranscriber',
          name: 'StartTranscription',
          appkey: APPKEY,
        },
        payload: {
          format: 'pcm',
          sample_rate: 16000,
          enable_intermediate_result: true,
          enable_punctuation_prediction: true,
        },
      };
      ws.send(JSON.stringify(start));
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const msg = parseMessage(data.toString());
      if (!msg?.header) return;
      const name = msg.header.name;
      const st = msg.header.status_text || msg.header.status_message || '';
      console.log('[event]', name, msg.header.status ?? '', st);
      if (name === 'TranscriptionStarted') {
        const frameBytes = 3200;
        const buf = Buffer.alloc(frameBytes, 0);
        let n = 0;
        const t = setInterval(() => {
          if (n >= 15 || ws.readyState !== WebSocket.OPEN) {
            clearInterval(t);
            const stop = {
              header: {
                message_id: randomId32(),
                task_id: taskId,
                namespace: 'SpeechTranscriber',
                name: 'StopTranscription',
                appkey: APPKEY,
              },
            };
            ws.send(JSON.stringify(stop));
            return;
          }
          ws.send(buf);
          n += 1;
        }, 100);
      }
      if (name === 'TranscriptionCompleted' || name === 'TaskFailed') {
        ws.close();
      }
    });

    ws.on('close', () => resolve());
    ws.on('error', (e) => reject(e));
  });

  console.log('verify-ws: 完成（若仅静音 PCM，可能无识别文本属正常）');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
