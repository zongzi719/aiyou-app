import React, { useState, useMemo } from 'react';
import { router } from 'expo-router';
import { apiEndpoints, groupLabels } from '@/src/dev/data/mockApis';
import { apiUsageMap } from '@/src/dev/data/apiUsageMap';

const methodColors: Record<string, string> = {
  GET: '#2563eb', POST: '#16a34a', PUT: '#ea580c', DELETE: '#dc2626', PATCH: '#ca8a04',
};

const S: Record<string, React.CSSProperties> = {
  page: { padding: 24, display: 'flex', flexDirection: 'column', gap: 24 },
  h2: { fontSize: 18, fontWeight: 600, color: '#e5e5e5', margin: 0 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 },
  statCard: { background: '#171717', border: '1px solid #262626', borderRadius: 8, padding: 16 },
  statLabel: { fontSize: 11, color: '#737373', marginBottom: 4 },
  filtersRow: { display: 'flex', gap: 12, alignItems: 'center' },
  searchWrap: { position: 'relative', flex: 1, maxWidth: 360 },
  searchIcon: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#737373', pointerEvents: 'none' },
  searchInput: { width: '100%', padding: '8px 12px 8px 36px', background: '#171717', border: '1px solid #404040', borderRadius: 6, color: '#e5e5e5', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
  select: { background: '#171717', border: '1px solid #404040', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#d4d4d4', cursor: 'pointer', outline: 'none' },
  groupSection: { display: 'flex', flexDirection: 'column', gap: 8 },
  groupTitle: { fontSize: 13, fontWeight: 600, color: '#737373', display: 'flex', alignItems: 'center', gap: 8, margin: 0 },
  badge: { background: 'transparent', border: '1px solid #404040', color: '#737373', fontSize: 11, padding: '1px 6px', borderRadius: 4 },
  tableWrap: { border: '1px solid #262626', borderRadius: 8, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: { background: '#171717', color: '#737373', padding: '10px 16px', textAlign: 'left' as const, fontWeight: 500, borderBottom: '1px solid #262626' },
  tr: { borderTop: '1px solid #262626', cursor: 'pointer' },
  td: { padding: '10px 16px', color: '#d4d4d4' },
};

function MethodBadge({ method }: { method: string }) {
  return (
    <span style={{ background: methodColors[method] || '#525252', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>
      {method}
    </span>
  );
}

export default function ApiManagement() {
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [groupFilter, setGroupFilter] = useState('ALL');

  const filtered = useMemo(() => {
    return apiEndpoints.filter(api => {
      if (search && !api.name.includes(search) && !api.path.includes(search)) return false;
      if (methodFilter !== 'ALL' && api.method !== methodFilter) return false;
      if (groupFilter !== 'ALL' && api.group !== groupFilter) return false;
      return true;
    });
  }, [search, methodFilter, groupFilter]);

  const total = apiEndpoints.length;
  const groups = Object.keys(groupLabels);
  const methodCounts: Record<string, number> = {};
  apiEndpoints.forEach(a => { methodCounts[a.method] = (methodCounts[a.method] || 0) + 1; });

  const stats = [
    { label: 'API总数', value: total, color: '#60a5fa' },
    { label: 'GET', value: methodCounts.GET || 0, color: '#60a5fa' },
    { label: 'POST', value: methodCounts.POST || 0, color: '#4ade80' },
    { label: 'DELETE', value: methodCounts.DELETE || 0, color: '#f87171' },
    { label: 'PATCH', value: methodCounts.PATCH || 0, color: '#facc15' },
  ];

  const grouped = useMemo(() => {
    const map: Record<string, typeof filtered> = {};
    filtered.forEach(api => {
      if (!map[api.group]) map[api.group] = [];
      map[api.group].push(api);
    });
    return map;
  }, [filtered]);

  return (
    <div style={S.page}>
      <h2 style={S.h2}>API 接口管理</h2>

      <div style={S.statsGrid}>
        {stats.map(s => (
          <div key={s.label} style={S.statCard}>
            <div style={S.statLabel}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={S.filtersRow}>
        <div style={S.searchWrap}>
          <span style={S.searchIcon}>🔍</span>
          <input
            placeholder="搜索接口名称或路径..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={S.searchInput}
          />
        </div>
        <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} style={S.select}>
          <option value="ALL">所有模块</option>
          {groups.map(g => <option key={g} value={g}>{groupLabels[g]}</option>)}
        </select>
        <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} style={S.select}>
          <option value="ALL">所有方法</option>
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {Object.entries(grouped).map(([group, apis]) => (
        <div key={group} style={S.groupSection}>
          <h3 style={S.groupTitle}>
            {groupLabels[group] || group}
            <span style={S.badge}>{apis.length}</span>
          </h3>
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  {['API名称', '接口路径', '方法', '描述', '调用情况', '操作'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apis.map(api => {
                  const usage = apiUsageMap[api.id];
                  const count = usage?.usages.length || 0;
                  return (
                    <tr key={api.id} style={S.tr} onMouseEnter={e => (e.currentTarget.style.background = '#171717')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ ...S.td, fontWeight: 500, color: '#e5e5e5' }}>{api.name}</td>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12, color: '#a3a3a3' }}>{api.path}</td>
                      <td style={S.td}><MethodBadge method={api.method} /></td>
                      <td style={{ ...S.td, color: '#737373', fontSize: 12, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{api.description}</td>
                      <td style={S.td}>
                        {count > 0
                          ? <span style={{ color: '#4ade80', fontSize: 12, fontWeight: 500 }}>{count}处已调用</span>
                          : <span style={{ color: '#404040', fontSize: 12 }}>未调用</span>
                        }
                      </td>
                      <td style={S.td}>
                        <button
                          onClick={() => router.push(`/dev/api-management/${api.id}`)}
                          style={{ color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, padding: 0 }}
                        >
                          查看详情
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
