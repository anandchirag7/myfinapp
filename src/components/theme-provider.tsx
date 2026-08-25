import { useEffect, useState } from "react";

export function useTheme() {
  const [theme, setThemeState] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem("paisa-theme") as "light" | "dark";
    if (saved && (saved === "light" || saved === "dark")) {
      setThemeState(saved);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("paisa-theme", theme);
  }, [theme]);

  return { theme, setTheme: setThemeState, toggle: () => setThemeState((t) => (t === "dark" ? "light" : "dark")) };
}
