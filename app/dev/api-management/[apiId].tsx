import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { apiEndpoints, groupLabels } from '@/src/dev/data/mockApis';
import { apiUsageMap } from '@/src/dev/data/apiUsageMap';
import { apiRelayWebRaw, getApiBaseUrlSync } from '@/lib/devApiConfigWeb';

const methodColors: Record<string, string> = {
  GET: '#2563eb', POST: '#16a34a', PUT: '#ea580c', DELETE: '#dc2626', PATCH: '#ca8a04',
};

const card: React.CSSProperties = { background: '#171717', border: '1px solid #262626', borderRadius: 8, padding: 16 };
const pre: React.CSSProperties = { background: '#0a0a0a', border: '1px solid #262626', borderRadius: 6, padding: 12, fontSize: 12, fontFamily: 'monospace', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#d4d4d4', margin: 0 };
const textarea: React.CSSProperties = { width: '100%', background: '#171717', border: '1px solid #404040', borderRadius: 6, padding: '8px 12px', color: '#e5e5e5', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box', minHeight: 60 };
const switchWrap: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#171717', border: '1px solid #262626', borderRadius: 8, padding: 16 };

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', background: checked ? '#3b82f6' : '#404040', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', display: 'block' }} />
    </button>
  );
}

function navActive(active: boolean): React.CSSProperties {
  return { padding: '6px 16px', borderRadius: 4, fontSize: 13, cursor: 'pointer', border: 'none', background: active ? '#404040' : 'transparent', color: active ? '#fff' : '#737373', fontWeight: active ? 500 : 400 };
}

export default function ApiDetail() {
  const { apiId } = useLocalSearchParams<{ apiId: string }>();
  const api = apiEndpoints.find(a => a.id === apiId);

  const [tab, setTab] = useState<'docs' | 'test' | 'config'>('docs');
  const [testHeaders, setTestHeaders] = useState('');
  const [testQuery, setTestQuery] = useState('');
  const [testBody, setTestBody] = useState('');
  const [testResult, setTestResult] = useState<{ status: number; time: number; body: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [notes, setNotes] = useState(api?.notes ?? '');
  const [mockEnabled, setMockEnabled] = useState(api?.mockEnabled ?? false);
  const [mockResponse, setMockResponse] = useState(api?.mockResponse ?? '');
  const [enabled, setEnabled] = useState(api?.enabled ?? true);

  if (!api) {
    return (
      <div style={{ padding: 24, color: '#737373' }}>
        接口不存在。
        <button onClick={() => router.push('/dev/api-management')} style={{ color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 8 }}>返回</button>
      </div>
    );
  }

  const baseUrl = getApiBaseUrlSync();
  const hasPathParams = Object.keys(api.pathParams).length > 0;
  const hasQueryParams = Object.keys(api.queryParams).length > 0 && Object.values(api.queryParams).some(v => v !== '');

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      let extraHeaders: Record<string, string> = {};
      try { extraHeaders = testHeaders ? JSON.parse(testHeaders) : {}; } catch {}
      let path = api.path;
      if (testQuery) {
        try { path += `?${new URLSearchParams(JSON.parse(testQuery)).toString()}`; } catch {}
      }
      let body: unknown = undefined;
      if (['POST', 'PUT', 'PATCH'].includes(api.method) && testBody) {
        try { body = JSON.parse(testBody); } catch { body = testBody; }
      }
      const { status, text, time } = await apiRelayWebRaw({ path, method: api.method, headers: { 'Content-Type': 'application/json', ...extraHeaders }, body });
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch {}
      setTestResult({ status, time, body: pretty });
    } catch (err: unknown) {
      setTestResult({ status: 0, time: 0, body: `Error: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setTesting(false);
    }
  };

  const usage = apiUsageMap[api.id];
  const statusLabel = usage?.status === 'connected' ? '✅ 已对接' : usage?.status === 'partial' ? '⚠️ 部分对接' : '❌ 未对接';
  const statusColor = usage?.status === 'connected' ? '#4ade80' : usage?.status === 'partial' ? '#facc15' : '#f87171';

  return (
    <div style={{ padding: 24, maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.push('/dev/api-management')} style={{ background: 'none', border: 'none', color: '#737373', cursor: 'pointer', fontSize: 20, padding: 0, lineHeight: 1 }}>←</button>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#e5e5e5', margin: 0 }}>{api.name}</h2>
        <span style={{ background: methodColors[api.method] || '#525252', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>{api.method}</span>
        <span style={{ fontSize: 11, background: '#262626', color: '#737373', padding: '2px 8px', borderRadius: 4 }}>{groupLabels[api.group] || api.group}</span>
      </div>

      {/* Basic Info */}
      <div style={card}>
        {[{ label: '路径', val: api.path }, { label: '基础URL', val: baseUrl }, { label: '描述', val: api.description }, ...(api.notes ? [{ label: '备注', val: api.notes }] : [])].map(row => (
          <div key={row.label} style={{ display: 'flex', gap: 24, fontSize: 13, marginBottom: 8 }}>
            <span style={{ color: '#737373', width: 80, flexShrink: 0 }}>{row.label}</span>
            <span style={{ color: row.label === '备注' ? '#fbbf24' : '#d4d4d4', fontFamily: 'monospace' }}>{row.val}</span>
          </div>
        ))}
      </div>

      {/* Usage */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#d4d4d4' }}>前端调用情况</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: statusColor }}>{statusLabel}</span>
        </div>
        {usage && usage.usages.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {usage.usages.map((u, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                <span style={{ fontFamily: 'monospace', color: '#737373', flexShrink: 0 }}>{u.file}</span>
                <span style={{ color: '#525252' }}>→</span>
                <span style={{ color: '#a3a3a3' }}>{u.component}: {u.description}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: '#525252', margin: 0 }}>当前没有前端组件调用此接口</p>
        )}
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 2, background: '#262626', border: '1px solid #404040', borderRadius: 6, padding: 3, width: 'fit-content' }}>
        {(['docs', 'test', 'config'] as const).map(t => (
          <button key={t} style={navActive(tab === t)} onClick={() => setTab(t)}>
            {{ docs: '文档', test: '测试', config: '配置' }[t]}
          </button>
        ))}
      </div>

      {/* Docs */}
      {tab === 'docs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {hasPathParams && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#a3a3a3', marginBottom: 8 }}>Path 参数</div>
              <div style={{ ...pre, padding: 12 }}>
                {Object.entries(api.pathParams).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
                    <span style={{ color: '#67e8f9', fontFamily: 'monospace' }}>{`{${k}}`}</span>
                    <span style={{ color: '#a3a3a3' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {Object.keys(api.headers).length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#a3a3a3', marginBottom: 8 }}>Headers</div>
              <pre style={pre}>{JSON.stringify(api.headers, null, 2)}</pre>
            </div>
          )}
          {hasQueryParams && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#a3a3a3', marginBottom: 8 }}>Query 参数</div>
              <pre style={pre}>{JSON.stringify(api.queryParams, null, 2)}</pre>
            </div>
          )}
          {api.bodyExample && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#a3a3a3', marginBottom: 8 }}>Body 参数</div>
              <pre style={pre}>{api.bodyExample}</pre>
            </div>
          )}
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#4ade80', marginBottom: 8 }}>成功返回</div>
            <pre style={{ ...pre, color: '#86efac' }}>{api.successResponse}</pre>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#f87171', marginBottom: 8 }}>错误返回</div>
            <pre style={{ ...pre, color: '#fca5a5' }}>{api.errorResponse}</pre>
          </div>
        </div>
      )}

      {/* Test */}
      {tab === 'test' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: '#737373', marginBottom: 4, display: 'block' }}>Headers (JSON)</label>
            <textarea value={testHeaders} onChange={e => setTestHeaders(e.target.value)} placeholder={JSON.stringify(api.headers, null, 2)} style={textarea} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#737373', marginBottom: 4, display: 'block' }}>Query 参数 (JSON)</label>
            <textarea value={testQuery} onChange={e => setTestQuery(e.target.value)} placeholder={hasQueryParams ? JSON.stringify(api.queryParams, null, 2) : '{}'} style={textarea} />
          </div>
          {['POST', 'PUT', 'PATCH'].includes(api.method) && (
            <div>
              <label style={{ fontSize: 11, color: '#737373', marginBottom: 4, display: 'block' }}>Body (JSON)</label>
              <textarea value={testBody} onChange={e => setTestBody(e.target.value)} placeholder={api.bodyExample || '{}'} style={{ ...textarea, minHeight: 80 }} />
            </div>
          )}
          <button onClick={handleTest} disabled={testing} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#16a34a', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
            {testing ? '⏳' : '▶'} 发送请求
          </button>
          {testResult && (
            <div style={card}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: testResult.status >= 200 && testResult.status < 400 ? '#4ade80' : '#f87171' }}>Status: {testResult.status || 'Failed'}</span>
                <span style={{ color: '#737373' }}>Time: {testResult.time}ms</span>
              </div>
              <pre style={{ ...pre, maxHeight: 320 }}>{testResult.body}</pre>
            </div>
          )}
        </div>
      )}

      {/* Config */}
      {tab === 'config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={switchWrap}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#e5e5e5' }}>启用接口</div>
              <div style={{ fontSize: 11, color: '#737373', marginTop: 2 }}>禁用后前端将不调用此接口</div>
            </div>
            <Toggle checked={enabled} onChange={setEnabled} />
          </div>
          <div style={switchWrap}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#e5e5e5' }}>Mock 模式</div>
              <div style={{ fontSize: 11, color: '#737373', marginTop: 2 }}>开启后使用模拟数据替代真实请求</div>
            </div>
            <Toggle checked={mockEnabled} onChange={setMockEnabled} />
          </div>
          {mockEnabled && (
            <div>
              <label style={{ fontSize: 11, color: '#737373', marginBottom: 4, display: 'block' }}>Mock 返回数据</label>
              <textarea value={mockResponse} onChange={e => setMockResponse(e.target.value)} style={{ ...textarea, minHeight: 100 }} />
            </div>
          )}
          <div>
            <label style={{ fontSize: 11, color: '#737373', marginBottom: 4, display: 'block' }}>开发备注</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="添加接口备注..." style={{ ...textarea, minHeight: 80 }} />
          </div>
        </div>
      )}
    </div>
  );
}
