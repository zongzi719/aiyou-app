import { Asset } from 'expo-asset';
import { Image } from 'react-native';

import { putKnowledgeData, putMemoryMemories } from '@/lib/listDataCache';
import { knowledgeApi } from '@/services/knowledgeApi';
import { memoryApi } from '@/services/memoryApi';
import { fetchProfile } from '@/services/profileApi';

let preloadOncePromise: Promise<void> | null = null;

const LOCAL_IMAGE_MODULES = [
  require('@/assets/images/private-chat-empty-top-bg.png'),
  require('@/assets/images/login-bg.png'),
  require('@/assets/images/chat-input-normal-bg.png'),
  require('@/assets/images/chat-link-btn.png'),
  require('@/assets/images/record-panel-bg.png'),
  require('@/assets/images/record-mic-custom.png'),
  require('@/assets/images/record-pause-custom.png'),
  require('@/assets/images/backgrounds/welcome-bg.jpg'),
  require('@/assets/images/backgrounds/login-bg-v2.png'),
  require('@/assets/images/model-init-intro-glow.jpg'),
  require('@/assets/images/backgrounds/model-init-home-bg.png'),
  require('@/assets/images/backgrounds/model-init-voice-screen-bg.jpg'),
  require('@/assets/images/model-init-voice/voice-mic-speak.png'),
  require('@/assets/images/model-init-voice/voice-mic-pause.png'),
  require('@/assets/images/backgrounds/model-init-interview-bg.jpg'),
  require('@/assets/images/backgrounds/model-init-image-bg.jpg'),
  require('@/assets/images/portrait-guide/example-single-front.png'),
  require('@/assets/images/portrait-guide/example-face-clear.png'),
  require('@/assets/images/portrait-guide/example-too-small.png'),
  require('@/assets/images/portrait-guide/example-face-obscured.png'),
  require('@/assets/images/backgrounds/model-init-avatar-loading-screen.jpg'),
  require('@/assets/images/backgrounds/model-init-avatar-done-screen.jpg'),
  require('@/assets/tabbar/add-center.png'),
  require('@/assets/tabbar/chat-active.png'),
  require('@/assets/tabbar/chat-inactive.png'),
  require('@/assets/tabbar/knowledge-active.png'),
  require('@/assets/tabbar/memory-active.png'),
  require('@/assets/tabbar/profile-active.png'),
  require('@/assets/tabbar/profile-inactive.png'),
  require('@/assets/img/logo-1.png'),
  require('@/assets/img/logo-2.png'),
  require('@/assets/img/logo-3.png'),
  require('@/assets/img/logo-4.png'),
  require('@/assets/img/logo-5.png'),
  require('@/assets/img/thomino.jpg'),
];

/**
 * 在应用启动时预热高频图片资源，避免首进页面时逐页闪现加载。
 */
export function preloadAppAssetsOnce(): Promise<void> {
  if (preloadOncePromise) return preloadOncePromise;
  preloadOncePromise = Asset.loadAsync(LOCAL_IMAGE_MODULES)
    .then(() => undefined)
    .catch(() => undefined);
  return preloadOncePromise;
}

let warmupDataOncePromise: Promise<void> | null = null;

/**
 * 应用启动时并行预取常用页面数据，减少首次切页等待。
 */
export function warmupAppDataOnce(): Promise<void> {
  if (warmupDataOncePromise) return warmupDataOncePromise;
  warmupDataOncePromise = Promise.allSettled([
    memoryApi.getMemories().then((list) => putMemoryMemories(list)),
    Promise.all([knowledgeApi.getFolders(), knowledgeApi.getFiles()]).then(([folders, fileResp]) =>
      putKnowledgeData(folders, fileResp.files)
    ),
  ])
    .then(() => undefined)
    .catch(() => undefined);
  return warmupDataOncePromise;
}

let warmupRemoteImagesOncePromise: Promise<void> | null = null;

/**
 * 预取常用远程图片（如用户头像），减少页面切换时首帧白图。
 */
export function warmupRemoteImagesOnce(): Promise<void> {
  if (warmupRemoteImagesOncePromise) return warmupRemoteImagesOncePromise;
  warmupRemoteImagesOncePromise = (async () => {
    try {
      const profile = await fetchProfile();
      const avatar = profile.avatar_url?.trim();
      if (avatar) {
        await Image.prefetch(avatar);
      }
    } catch {
      // ignore remote warmup failure
    }
  })()
    .then(() => undefined)
    .catch(() => undefined);
  return warmupRemoteImagesOncePromise;
}
