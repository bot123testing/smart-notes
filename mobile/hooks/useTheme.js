// Re-export from ThemeContext for backward compatibility.
// All screens that import useTheme from this file will get the
// context-backed version (with persistent override support).
export { useTheme } from '../context/ThemeContext';
