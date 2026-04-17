import { Redirect, Slot, usePathname, router } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

function isDevPortalAllowed(): boolean {
  if (Platform.OS !== 'web') return false;
  if (__DEV__) return true;
  return process.env.EXPO_PUBLIC_DEV_TOOLS === 'true';
}

const navItems = [
  { to: '/dev/api-management', label: 'API管理' },
  { to: '/dev/api-pages', label: '页面预览' },
  { to: '/dev/api-logs', label: '调用日志' },
  { to: '/dev/api-health', label: '健康监控' },
  { to: '/dev/api-settings', label: '环境配置' },
];

export default function DevRootLayout() {
  const pathname = usePathname();

  if (!isDevPortalAllowed()) {
    return <Redirect href="/" />;
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#e5e5e5',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 14,
      }}>
      <aside
        style={{
          width: 224,
          flexShrink: 0,
          borderRight: '1px solid #262626',
          background: '#171717',
          display: 'flex',
          flexDirection: 'column',
        }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid #262626' }}>
          <h1
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: '#a3a3a3',
              textTransform: 'uppercase',
              margin: 0,
            }}>
            Developer Tools
          </h1>
        </div>
        <nav style={{ flex: 1, padding: '12px 8px' }}>
          {navItems.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <button
                key={item.to}
                onClick={() => router.push(item.to)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 6,
                  marginBottom: 2,
                  fontSize: 13,
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: active ? '#262626' : 'transparent',
                  color: active ? '#ffffff' : '#737373',
                  fontWeight: active ? 500 : 400,
                }}>
                {item.label}
              </button>
            );
          })}
        </nav>
        <div style={{ padding: '12px 16px', borderTop: '1px solid #262626' }}>
          <button
            onClick={() => router.push('/')}
            style={{
              fontSize: 12,
              color: '#525252',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}>
            ← 返回 APP
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        <Slot />
      </main>
    </div>
  );
}
