import { useTheme } from './ThemeContext';

export const useThemeColors = () => {
  const { isDark } = useTheme();

  return {
    icon: isDark ? 'white' : 'black',
    bg: isDark ? '#171717' : '#f5f5f5',
    invert: isDark ? '#000000' : '#ffffff',
    secondary: isDark ? '#323232' : '#ffffff',
    state: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
    sheet: isDark ? '#262626' : '#ffffff',
    highlight: '#0EA5E9',    
    lightDark: isDark ? '#262626' : 'white',
    border: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
    text: isDark ? 'white' : 'black',
    placeholder: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
    switch: isDark ? 'rgba(255,255,255,0.4)' : '#ccc',
    chatBg: isDark ? '#262626' : '#efefef',
    gradient: isDark ? 'rgba(0,0,0,1)' : 'rgba(0,0,0,0.1)',
    isDark
  };
};

export default useThemeColors;