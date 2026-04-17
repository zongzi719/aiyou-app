import React, { useState, useMemo } from 'react';

import { getPageApiMappings, apiUsageMap, type PageApiMapping } from '@/src/dev/data/apiUsageMap';
import { apiEndpoints } from '@/src/dev/data/mockApis';

type Status = 'full' | 'partial' | 'none' | 'no-api';

const statusConfig: Record<
  Status,
  { label: string; color: string; bg: string; border: string; icon: string }
> = {
  full: {
    label: '已对接',
    color: '#4ade80',
    bg: 'rgba(74,222,128,0.1)',
    border: 'rgba(74,222,128,0.3)',
    icon: '✓',
  },
  partial: {
    label: '部分对接',
    color: '#facc15',
    bg: 'rgba(250,204,21,0.1)',
    border: 'rgba(250,204,21,0.3)',
    icon: '!',
  },
  none: {
    label: '未对接',
    color: '#f87171',
    bg: 'rgba(248,113,113,0.1)',
    border: 'rgba(248,113,113,0.3)',
    icon: '!',
  },
  'no-api': {
    label: '无需API',
    color: '#737373',
    bg: 'rgba(115,115,115,0.1)',
    border: 'rgba(115,115,115,0.3)',
    icon: '✓',
  },
};

const methodColors: Record<string, string> = {
  GET: '#16a34a',
  POST: '#2563eb',
  PUT: '#ea580c',
  DELETE: '#dc2626',
  PATCH: '#ca8a04',
};

function getStatus(page: PageApiMapping): Status {
  if (page.plannedApis.length === 0) return 'no-api';
  if (page.connectedApis.length === 0) return 'none';
  if (page.connectedApis.length < page.plannedApis.length) return 'partial';
  return 'full';
}

function cardStyle(selected: boolean): React.CSSProperties {
  return {
    background: '#171717',
    border: `1px solid ${selected ? '#525252' : '#262626'}`,
    borderRadius: 8,
    padding: 16,
    cursor: 'pointer',
    textAlign: 'left',
    boxShadow: selected ? '0 0 0 1px #525252' : 'none',
    transition: 'border-color 0.15s',
    width: '100%',
  };
}

function badgeStyle(status: Status): React.CSSProperties {
  const cfg = statusConfig[status];
  return {
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 4,
    border: `1px solid ${cfg.border}`,
    background: cfg.bg,
    color: cfg.color,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
  };
}

export default function ApiPagePreview() {
  const pageApiMappings = useMemo(() => getPageApiMappings(), []);
  const [selected, setSelected] = useState<PageApiMapping | null>(null);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#e5e5e5', margin: '0 0 4px' }}>
          页面接口预览
        </h2>
        <p style={{ fontSize: 12, color: '#737373', margin: 0 }}>
          点击任意页面，查看其 API 对接状态和详细信息
        </p>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {(['full', 'partial', 'none', 'no-api'] as Status[]).map((status) => {
          const count = pageApiMappings.filter((p) => getStatus(p) === status).length;
          return (
            <div
              key={status}
              style={{
                background: '#171717',
                border: '1px solid #262626',
                borderRadius: 8,
                padding: 16,
              }}>
              <div style={{ fontSize: 11, color: '#737373', marginBottom: 4 }}>
                {statusConfig[status].label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#e5e5e5' }}>{count}</div>
            </div>
          );
        })}
      </div>

      {/* Page Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {pageApiMappings.map((page) => {
          const status = getStatus(page);
          const isSelected = selected?.path === page.path;
          return (
            <button
              key={page.path}
              onClick={() => setSelected(isSelected ? null : page)}
              style={cardStyle(isSelected)}
              onMouseEnter={(e) => {
                if (!isSelected)
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#404040';
              }}
              onMouseLeave={(e) => {
                if (!isSelected)
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#262626';
              }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#e5e5e5',
                  }}>
                  <span style={{ color: '#737373' }}>▣</span>
                  {page.name}
                </div>
                <span style={badgeStyle(status)}>
                  {statusConfig[status].icon} {statusConfig[status].label}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#737373', marginBottom: 6 }}>
                {page.description}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#525252' }}>
                {page.path}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 10 }}>
                {page.connectedApis.length > 0 && (
                  <span style={{ color: '#4ade80' }}>{page.connectedApis.length} 已接</span>
                )}
                {page.plannedApis.length > page.connectedApis.length && (
                  <span style={{ color: '#facc15' }}>
                    {page.plannedApis.length - page.connectedApis.length} 待接
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail Panel */}
      {selected && (
        <div
          style={{
            background: '#171717',
            border: '1px solid #404040',
            borderRadius: 8,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                fontWeight: 600,
                color: '#e5e5e5',
              }}>
              <span>▣</span>
              {selected.name}
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#737373' }}>
                {selected.path}
              </span>
            </div>
            <button
              onClick={() => setSelected(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#737373',
                cursor: 'pointer',
                fontSize: 18,
              }}>
              ✕
            </button>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: 12 }}>
            <div style={{ fontSize: 11, color: '#737373', marginBottom: 4 }}>当前数据来源</div>
            <div style={{ fontSize: 13, color: '#d4d4d4' }}>{selected.currentDataSource}</div>
          </div>

          {selected.connectedApis.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#4ade80', marginBottom: 8 }}>
                ✓ 已对接接口
              </div>
              {selected.connectedApis.map((apiId) => {
                const api = apiEndpoints.find((a) => a.id === apiId);
                const usage = apiUsageMap[apiId];
                if (!api) return null;
                return (
                  <div
                    key={apiId}
                    style={{
                      background: '#262626',
                      borderRadius: 6,
                      padding: 12,
                      marginBottom: 6,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span
                        style={{
                          background: methodColors[api.method] || '#525252',
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 3,
                        }}>
                        {api.method}
                      </span>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#d4d4d4' }}>
                        {api.path}
                      </span>
                      <span style={{ fontSize: 12, color: '#737373' }}>{api.name}</span>
                    </div>
                    {usage?.usages.map((u, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 11,
                          color: '#a3a3a3',
                          paddingLeft: 8,
                        }}>
                        <span style={{ color: 'rgba(74,222,128,0.5)' }}>→</span>
                        <span style={{ fontFamily: 'monospace', color: '#737373' }}>{u.file}</span>
                        <span>→ {u.description}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {selected.plannedApis.filter((id) => !selected.connectedApis.includes(id)).length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#facc15', marginBottom: 8 }}>
                ! 待对接接口
              </div>
              {selected.plannedApis
                .filter((id) => !selected.connectedApis.includes(id))
                .map((apiId) => {
                  const api = apiEndpoints.find((a) => a.id === apiId);
                  if (!api) return null;
                  return (
                    <div
                      key={apiId}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px dashed #404040',
                        borderRadius: 6,
                        padding: 12,
                        marginBottom: 6,
                      }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span
                          style={{
                            background: '#404040',
                            color: '#fff',
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 3,
                          }}>
                          {api.method}
                        </span>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#a3a3a3' }}>
                          {api.path}
                        </span>
                        <span style={{ fontSize: 12, color: '#525252' }}>{api.name}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#525252' }}>{api.description}</div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
