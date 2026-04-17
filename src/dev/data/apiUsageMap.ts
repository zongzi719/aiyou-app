/**
 * API 与页面对接状态：由代码扫描结果（apiUsageScan.generated.ts）+ 页面规划（pageApiSpecs）合并得到。
 * 更新扫描：在项目根执行 npm run sync-api-usage
 */

import { apiUsageScan, apiUsageScanGeneratedAt } from '@/src/dev/data/apiUsageScan.generated';
import { apiEndpoints } from '@/src/dev/data/mockApis';

export { apiUsageScanGeneratedAt };

export interface ApiUsageEntry {
  apiId: string;
  status: 'connected' | 'partial' | 'none';
  usages: {
    file: string;
    component: string;
    description: string;
  }[];
}

function fileToComponentLabel(file: string): string {
  const base = file.split('/').pop() ?? file;
  return base.replace(/\.(tsx?|jsx?)$/, '');
}

function buildApiUsageMap(): Record<string, ApiUsageEntry> {
  const map: Record<string, ApiUsageEntry> = {};
  for (const ep of apiEndpoints) {
    const files = apiUsageScan[ep.id]?.files ?? [];
    const usages = files.map((file) => ({
      file,
      component: fileToComponentLabel(file),
      description: '代码中出现该接口 path（含 lib 被 app 引用时的归并）',
    }));
    const status: ApiUsageEntry['status'] = usages.length > 0 ? 'connected' : 'none';
    map[ep.id] = { apiId: ep.id, status, usages };
  }
  return map;
}

/** 各接口：对接状态与引用文件（来自扫描，随 sync-api-usage 更新） */
export const apiUsageMap: Record<string, ApiUsageEntry> = buildApiUsageMap();

export interface PageApiMapping {
  path: string;
  name: string;
  description: string;
  connectedApis: string[];
  plannedApis: string[];
  currentDataSource: string;
}

export type PageApiSpec = Omit<PageApiMapping, 'connectedApis'>;

/** 路由与规划接口（connectedApis 由 getPageApiMappings() 根据扫描结果计算） */
export const pageApiSpecs: PageApiSpec[] = [
  {
    path: '/',
    name: '首页聊天',
    description: '主对话、抽屉入口、模型选择',
    plannedApis: [
      'runs-stream',
      'threads-create',
      'sessions-create',
      'models-list',
      'asr-chat',
      'asr-notes',
    ],
    currentDataSource: '私人模式：lib/privateChatApi；语音：lib/asrApi（/api/asr、/api/asr-notes）',
  },
  {
    path: '/screens/welcome',
    name: '欢迎页',
    description: '启动/欢迎流程',
    plannedApis: [],
    currentDataSource: '纯前端',
  },
  {
    path: '/screens/login',
    name: '登录',
    description: '用户名密码登录',
    plannedApis: ['auth-login'],
    currentDataSource: '直连后端：lib/userLoginApi.ts（接入后执行 sync-api-usage 更新引用）',
  },
  {
    path: '/screens/signup',
    name: '注册',
    description: '新用户注册',
    plannedApis: ['auth-register'],
    currentDataSource: '待接 auth-register',
  },
  {
    path: '/screens/profile',
    name: '个人资料',
    description: '设置入口、升级、帮助等',
    plannedApis: ['auth-me', 'memory-get'],
    currentDataSource: '列表跳转为主，待接后端',
  },
  {
    path: '/screens/search-form',
    name: '探索',
    description: '搜索/发现列表',
    plannedApis: [],
    currentDataSource: '模板 mock 数据',
  },
  {
    path: '/dev',
    name: '开发者工具',
    description: 'API 管理、日志、健康检查、环境配置',
    plannedApis: [],
    currentDataSource: 'dev 工具直连 EXPO_PUBLIC_DEV_API_BASE_URL / AsyncStorage 配置',
  },
];

function routeToPrimaryScreenFiles(routePath: string): string[] {
  if (routePath === '/') {
    return ['app/(drawer)/index.tsx'];
  }
  if (routePath.startsWith('/screens/')) {
    const slug = routePath.replace(/^\/screens\//, '');
    return [`app/screens/${slug}.tsx`];
  }
  return [];
}

/** 仅 lib 内有 path、尚未在页面写 import 时，用「页面 ↔ 接口模块」约定归到该页 */
const libModuleHintsForPage: { routePath: string; apiId: string; pathSubstring: string }[] = [
  { routePath: '/screens/login', apiId: 'auth-login', pathSubstring: 'userLoginApi' },
  { routePath: '/', apiId: 'runs-stream', pathSubstring: 'privateChatApi' },
  { routePath: '/', apiId: 'threads-create', pathSubstring: 'privateChatApi' },
  { routePath: '/', apiId: 'sessions-create', pathSubstring: 'privateChatApi' },
  { routePath: '/', apiId: 'models-list', pathSubstring: 'modelsApi' },
  { routePath: '/', apiId: 'asr-chat', pathSubstring: 'asrApi' },
  { routePath: '/', apiId: 'asr-notes', pathSubstring: 'asrApi' },
];

function pageTouchesApi(routePath: string, apiId: string): boolean {
  const files = apiUsageScan[apiId]?.files ?? [];
  if (files.length === 0) return false;
  const hint = libModuleHintsForPage.find((h) => h.routePath === routePath && h.apiId === apiId);
  if (hint && files.some((f) => f.includes(hint.pathSubstring))) {
    return true;
  }
  if (routePath.startsWith('/dev')) {
    return files.some((f) => f.startsWith('app/dev/'));
  }
  const targets = routeToPrimaryScreenFiles(routePath);
  if (targets.length === 0) return false;
  return files.some((f) => targets.some((t) => f === t || f.endsWith(`/${t}`)));
}

/** 带「已接规划内接口」列表的页面矩阵（对接状态随扫描更新） */
export function getPageApiMappings(): PageApiMapping[] {
  return pageApiSpecs.map((spec) => ({
    ...spec,
    connectedApis: spec.plannedApis.filter((apiId) => pageTouchesApi(spec.path, apiId)),
  }));
}
