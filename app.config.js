/* eslint-disable @typescript-eslint/no-require-imports */
const appJson = require('./app.json');

module.exports = () => {
  const wechatAppId = process.env.EXPO_PUBLIC_WECHAT_APP_ID?.trim();
  const expo = JSON.parse(JSON.stringify(appJson.expo));
  const infoPlist = { ...expo.ios.infoPlist };
  const schemes = new Set([
    ...(infoPlist.LSApplicationQueriesSchemes || []),
    'weixin',
    'weixinULAPI',
    'weixinURLParamsAPI',
  ]);
  infoPlist.LSApplicationQueriesSchemes = [...schemes];

  if (wechatAppId?.startsWith('wx')) {
    const urlTypes = [...(infoPlist.CFBundleURLTypes || [])];
    const hasWeChat = urlTypes.some(
      (t) =>
        Array.isArray(t.CFBundleURLSchemes) &&
        t.CFBundleURLSchemes.some((s) => typeof s === 'string' && s.startsWith('wx'))
    );
    if (!hasWeChat) {
      urlTypes.push({
        CFBundleTypeRole: 'Editor',
        CFBundleURLName: 'weixin',
        CFBundleURLSchemes: [wechatAppId],
      });
    }
    infoPlist.CFBundleURLTypes = urlTypes;
  }

  expo.ios.infoPlist = infoPlist;
  return expo;
};
