import React, { useState, useEffect } from 'react';
import { getApiLogs, clearApiLogs, type ApiLogEntry } from '@/src/dev/data/apiLogStore';

const methodColors: Record<string, React.CSSProperties> = {
  GET:    { background: 'rgba(16,185,129,0.15)', color: '#34d399' },
  POST:   { background: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
  PUT:    { background: 'rgba(245,158,11,0.15)', color: '#fbbf24' },
  DELETE: { background: 'rgba(239,68,68,0.15)',  color: '#f87171' },
  PATCH:  { background: 'rgba(168,85,247,0.15)', color: '#c084fc' },
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false });
}

const S: Record<string, React.CSSProperties> = {
  page: { padding: 24, display: 'flex', flexDirection: 'column', gap: 16 },
  topRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  h2: { fontSize: 18, fontWeight: 600, color: '#e5e5e5', margin: 0 },
  actions: { display: 'flex', alignItems: 'center', gap: 12 },
  select: { background: '#171717', border: '1px solid #404040', borderRadius: 6, padding: '6px 12px', fontSize: 13, color: '#d4d4d4', outline: 'none', cursor: 'pointer' },
  clearBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'none', border: '1px solid #404040', borderRadius: 6, color: '#d4d4d4', cursor: 'pointer', fontSize: 13 },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: '#525252' },
  emptyIcon: { fontSize: 48, marginBottom: 12, opacity: 0.3 },
  tableWrap: { border: '1px solid #262626', borderRadius: 8, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: { background: '#171717', color: '#737373', padding: '10px 16px', textAlign: 'left' as const, fontWeight: 500, borderBottom: '1px solid #262626' },
  tr: { borderTop: '1px solid #262626', cursor: 'pointer' },
  td: { padding: '8px 16px' },
  expandPanel: { background: '#0a0a0a', borderTop: '1px solid #262626', padding: 16 },
  expandGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 },
  pre: { background: '#171717', borderRadius: 6, padding: 10, fontSize: 12, fontFamily: 'monospace', overflowX: 'auto', maxHeight: 192, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#d4d4d4', margin: 0 },
  footer: { fontSize: 12, color: '#525252' },
};

export default function ApiLogs() {
  const [logs, setLogs] = useState<ApiLogEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const tick = setInterval(() => setLogs([...getApiLogs()]), 1000);
    setLogs([...getApiLogs()]);
    return () => clearInterval(tick);
  }, []);

  const filtered = logs.filter(l => {
    if (statusFilter === 'success') return l.success;
    if (statusFilter === 'fail') return !l.success;
    return true;
  });

  return (
    <div style={S.page}>
      <div style={S.topRow}>
        <h2 style={S.h2}>API 调用日志</h2>
        <div style={S.actions}>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={S.select}>
            <option value="all">全部</option>
            <option value="success">成功</option>
            <option value="fail">失败</option>
          </select>
          <button onClick={() => { clearApiLogs(); setLogs([]); }} style={S.clearBtn}>
            🗑 清空
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={S.empty}>
          <span style={S.emptyIcon}>📄</span>
          <p style={{ margin: 0, fontSize: 14 }}>暂无调用日志</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#404040' }}>通过 apiDirectRaw / apiRelayWebRaw 发起的请求将自动记录在此</p>
        </div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: 24 }} />
                <th style={{ ...S.th, width: 80 }}>时间</th>
                <th style={{ ...S.th, width: 80 }}>方法</th>
                <th style={S.th}>路径</th>
                <th style={{ ...S.th, width: 70 }}>状态</th>
                <th style={{ ...S.th, width: 80, textAlign: 'right' }}>耗时</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => {
                const expanded = expandedId === log.id;
                const mc = methodColors[log.method] || { background: 'rgba(115,115,115,0.1)', color: '#a3a3a3' };
                return (
                  <React.Fragment key={log.id}>
                    <tr
                      style={S.tr}
                      onClick={() => setExpandedId(expanded ? null : log.id)}
                      onMouseEnter={e => (e.currentTarget.style.background = '#171717')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ ...S.td, color: '#737373', width: 24 }}>{expanded ? '▼' : '▶'}</td>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12, color: '#a3a3a3' }}>{formatTime(log.timestamp)}</td>
                      <td style={S.td}>
                        <span style={{ ...mc, fontSize: 11, fontFamily: 'monospace', padding: '2px 6px', borderRadius: 4 }}>{log.method}</span>
                      </td>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12, color: '#d4d4d4', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.path}</td>
                      <td style={S.td}>
                        {log.status === 0
                          ? <span style={{ fontSize: 12, border: '1px solid #7f1d1d', color: '#f87171', padding: '1px 6px', borderRadius: 4 }}>ERR</span>
                          : <span style={{ fontSize: 12, border: `1px solid ${log.success ? '#14532d' : '#7f1d1d'}`, color: log.success ? '#4ade80' : '#f87171', padding: '1px 6px', borderRadius: 4 }}>{log.status}</span>
                        }
                      </td>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12, color: '#a3a3a3', textAlign: 'right' }}>{log.duration}ms</td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={6} style={{ padding: 0 }}>
                          <div style={S.expandPanel}>
                            {log.error && (
                              <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 12, color: '#f87171', fontWeight: 600, marginBottom: 4 }}>错误</div>
                                <pre style={{ ...S.pre, color: '#fca5a5', background: 'rgba(239,68,68,0.05)' }}>{log.error}</pre>
                              </div>
                            )}
                            <div style={S.expandGrid}>
                              <div>
                                <div style={{ fontSize: 11, color: '#737373', fontWeight: 600, marginBottom: 6 }}>请求体</div>
                                <pre style={S.pre}>{log.requestBody ? JSON.stringify(log.requestBody, null, 2) : '—'}</pre>
                              </div>
                              <div>
                                <div style={{ fontSize: 11, color: '#737373', fontWeight: 600, marginBottom: 6 }}>响应体</div>
                                <pre style={S.pre}>
                                  {log.responseBody
                                    ? (typeof log.responseBody === 'string' ? log.responseBody : JSON.stringify(log.responseBody, null, 2))
                                    : '—'}
                                </pre>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p style={S.footer}>共 {filtered.length} 条记录（内存存储，刷新后清空）</p>
    </div>
  );
}
