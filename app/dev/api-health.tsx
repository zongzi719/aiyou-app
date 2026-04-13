import React, { useState } from 'react';
import { apiEndpoints, groupLabels } from '@/src/dev/data/mockApis';
import { apiRelayWebRaw } from '@/lib/devApiConfigWeb';

type HealthResult = { status: 'ok' | 'error'; statusCode: number; time: number };

const S: Record<string, React.CSSProperties> = {
  page: { padding: 24, display: 'flex', flexDirection: 'column', gap: 24 },
  topRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  h2: { fontSize: 18, fontWeight: 600, color: '#e5e5e5', margin: 0 },
  topRight: { display: 'flex', alignItems: 'center', gap: 12 },
  lastCheck: { fontSize: 12, color: '#737373' },
  checkBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#262626', border: 'none', borderRadius: 6, color: '#d4d4d4', cursor: 'pointer', fontSize: 13 },
  hint: { fontSize: 12, color: '#737373', margin: 0 },
  tableWrap: { border: '1px solid #262626', borderRadius: 8, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: { background: '#171717', color: '#737373', padding: '12px 16px', textAlign: 'left' as const, fontWeight: 500, borderBottom: '1px solid #262626' },
  tr: { borderTop: '1px solid #262626' },
  td: { padding: '12px 16px', color: '#d4d4d4' },
};

function StatusBadge({ result }: { result: HealthResult | undefined }) {
  if (!result) {
    return <span style={{ fontSize: 12, border: '1px solid #404040', color: '#737373', padding: '2px 8px', borderRadius: 4 }}>未检测</span>;
  }
  const ok = result.status === 'ok';
  return (
    <span style={{ fontSize: 12, border: `1px solid ${ok ? '#166534' : '#7f1d1d'}`, color: ok ? '#4ade80' : '#f87171', padding: '2px 8px', borderRadius: 4 }}>
      {ok ? '正常' : '异常'}
    </span>
  );
}

export default function ApiHealth() {
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<Record<string, HealthResult>>({});
  const [lastCheck, setLastCheck] = useState<string | null>(null);

  const checkable = apiEndpoints.filter(a => a.method === 'GET' && !a.path.includes('{'));

  const handleCheck = async () => {
    setChecking(true);
    const newResults: Record<string, HealthResult> = {};
    for (const api of checkable) {
      try {
        const { status, time } = await apiRelayWebRaw({ path: api.path, method: 'GET' });
        newResults[api.id] = { status: status >= 200 && status < 400 ? 'ok' : 'error', statusCode: status, time };
      } catch {
        newResults[api.id] = { status: 'error', statusCode: 0, time: 0 };
      }
    }
    setResults(newResults);
    setLastCheck(new Date().toLocaleTimeString());
    setChecking(false);
  };

  return (
    <div style={S.page}>
      <div style={S.topRow}>
        <h2 style={S.h2}>API 健康监控</h2>
        <div style={S.topRight}>
          {lastCheck && <span style={S.lastCheck}>上次检测：{lastCheck}</span>}
          <button onClick={handleCheck} disabled={checking} style={S.checkBtn}>
            {checking ? '⏳' : '↻'} 立即检测
          </button>
        </div>
      </div>

      <p style={S.hint}>仅检测无路径参数的 GET 接口（共 {checkable.length} 个）。点击「立即检测」发送真实请求。</p>

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              {['API名称', '接口路径', '模块', '状态', '状态码', '响应时间'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {checkable.map(api => {
              const r = results[api.id];
              return (
                <tr key={api.id} style={S.tr} onMouseEnter={e => (e.currentTarget.style.background = '#171717')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ ...S.td, fontWeight: 500, color: '#e5e5e5' }}>{api.name}</td>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12, color: '#a3a3a3' }}>{api.path}</td>
                  <td style={{ ...S.td, fontSize: 12, color: '#737373' }}>{groupLabels[api.group]}</td>
                  <td style={S.td}><StatusBadge result={r} /></td>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>{r ? (r.statusCode || '—') : '—'}</td>
                  <td style={{ ...S.td, fontSize: 12 }}>{r ? `${r.time}ms` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
