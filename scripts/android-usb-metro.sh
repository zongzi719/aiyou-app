#!/usr/bin/env bash
# 为 USB 连接的真机转发 Metro/Expo 常用端口，配合 --host localhost 使用，无需改代码。
# 先插好手机并打开 USB 调试，再运行：npm run start:android:usb
set -euo pipefail
if command -v adb >/dev/null 2>&1; then
  for p in 8081 19000 19001; do
    adb reverse "tcp:$p" "tcp:$p" 2>/dev/null || true
  done
else
  echo "未找到 adb：请安装 Android 平台工具并将 adb 加入 PATH。若用 WiFi 同网调试用：npm run start" >&2
fi
exec npx expo start --dev-client --host localhost "$@"
