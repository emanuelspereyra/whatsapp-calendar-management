import { useEffect, useState } from "react";

const STORAGE_KEY = "theme";

export type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  const stored = document.documentElement.getAttribute("data-theme");
  return stored === "dark" ? "dark" : "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function toggleTheme() {
    setThemeState((current) => (current === "dark" ? "light" : "dark"));
  }

  return { theme, toggleTheme };
}
