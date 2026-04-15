import React, { useState, useEffect } from 'react';
import { PRODUCTION_API_BASE_URL } from '@/lib/devApiConfig';
import { getApiBaseUrlSync, getDevUserIdSync, getGlobalMockSync, saveDevSettings } from '@/lib/devApiConfigWeb';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
        background: checked ? '#3b82f6' : '#404040', position: 'relative', flexShrink: 0,
        transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3, width: 16, height: 16,
        background: '#fff', borderRadius: '50%', transition: 'left 0.2s', display: 'block',
      }} />
    </button>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { padding: 24, maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 24 },
  h2: { fontSize: 18, fontWeight: 600, color: '#e5e5e5', margin: 0 },
  card: { background: '#171717', border: '1px solid #262626', borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', gap: 20 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, color: '#a3a3a3' },
  input: { background: '#0a0a0a', border: '1px solid #404040', borderRadius: 6, padding: '8px 12px', color: '#e5e5e5', fontSize: 13, fontFamily: 'monospace', outline: 'none', width: '100%', boxSizing: 'border-box' as const },
  hint: { fontSize: 11, color: '#525252', margin: 0 },
  switchRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  switchText: { display: 'flex', flexDirection: 'column', gap: 2 },
  saveBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#262626', border: 'none', borderRadius: 6, color: '#d4d4d4', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  toast: { fontSize: 13, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 6 },
};

export default function ApiSettings() {
  const [baseUrl, setBaseUrl] = useState('');
  const [userId, setUserId] = useState('');
  const [globalMock, setGlobalMock] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setBaseUrl(getApiBaseUrlSync());
    setUserId(getDevUserIdSync());
    setGlobalMock(getGlobalMockSync());
  }, []);

  const handleSave = () => {
    saveDevSettings(baseUrl, userId, globalMock);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={S.page}>
      <h2 style={S.h2}>环境配置</h2>

      <div style={S.card}>
        <div style={S.field}>
          <label style={S.label}>API 基础地址 (API_BASE_URL)</label>
          <input
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder={PRODUCTION_API_BASE_URL}
            style={S.input}
          />
          <p style={S.hint}>
            默认直连线上网关，无需本机代理。所有接口以此地址为前缀，路径前缀为 /api。点击下方可一键填回线上地址。
          </p>
          <button
            type="button"
            onClick={() => setBaseUrl(PRODUCTION_API_BASE_URL)}
            style={{ ...S.saveBtn, alignSelf: 'flex-start', marginTop: 4 }}
          >
            使用线上网关（{PRODUCTION_API_BASE_URL}）
          </button>
        </div>

        <div style={S.field}>
          <label style={S.label}>用户 ID (X-User-ID)</label>
          <input
            value={userId}
            onChange={e => setUserId(e.target.value)}
            placeholder="a2556c1100a20b2cd93f42e6859907fd"
            style={S.input}
          />
          <p style={S.hint}>请求时附加的 X-User-ID 头</p>
        </div>

        <div style={S.switchRow}>
          <div style={S.switchText}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#e5e5e5' }}>全局 Mock 模式</span>
            <span style={{ fontSize: 11, color: '#737373' }}>开启后所有接口使用模拟数据，不发送真实请求</span>
          </div>
          <Toggle checked={globalMock} onChange={setGlobalMock} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={handleSave} style={S.saveBtn}>
          💾 保存配置
        </button>
        {saved && <span style={S.toast}>✓ 配置已保存</span>}
      </div>
    </div>
  );
}
