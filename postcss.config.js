/** NativeWind v4：不再使用 `nativewind/postcss`；由 Babel + Metro 处理样式。 */
module.exports = {
  plugins: [require('tailwindcss')],
};
