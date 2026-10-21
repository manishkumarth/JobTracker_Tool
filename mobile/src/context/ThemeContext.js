import { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";

const ThemeContext = createContext(null);

const LIGHT = {
  bg: "#f9fafb",
  card: "#ffffff",
  text: "#111827",
  textMuted: "#6b7280",
  border: "#e5e7eb",
  primary: "#2563eb",
  primaryText: "#ffffff",
  danger: "#dc2626",
  success: "#059669",
  warning: "#d97706",
  tabBg: "#ffffff",
  tabActive: "#2563eb",
  tabInactive: "#6b7280",
};

const DARK = {
  bg: "#0b1220",
  card: "#111827",
  text: "#f9fafb",
  textMuted: "#9ca3af",
  border: "#1f2937",
  primary: "#3b82f6",
  primaryText: "#ffffff",
  danger: "#ef4444",
  success: "#10b981",
  warning: "#f59e0b",
  tabBg: "#111827",
  tabActive: "#3b82f6",
  tabInactive: "#9ca3af",
};

export const ThemeProvider = ({ children }) => {
  const system = useColorScheme();
  const [isDark, setIsDark] = useState(system === "dark");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem("theme");
      if (saved) setIsDark(saved === "dark");
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark, loaded]);

  const toggleTheme = () => setIsDark((p) => !p);
  const colors = isDark ? DARK : LIGHT;

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};
