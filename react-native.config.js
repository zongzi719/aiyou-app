module.exports = {
  dependencies: {
    'expo-react-native-wechat-v2': {
      root: './node_modules/expo-react-native-wechat-v2',
      platforms: {
        ios: {
          podspecPath: './node_modules/expo-react-native-wechat-v2/expo-react-native-wechat-v2.podspec',
        },
        android: {
          sourceDir: './node_modules/expo-react-native-wechat-v2/android',
        },
      },
    },
  },
};
