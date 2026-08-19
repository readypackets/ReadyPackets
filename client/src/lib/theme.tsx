/**
 * Dark mode / theme management.
 *
 * Persists the user's preference to localStorage and applies the `dark` class
 * to the document root so Tailwind's `dark:` variants work. Respects the
 * system preference on first visit.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useCookieConsent } from "@/components/privacy/CookieConsent";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => undefined,
  toggleTheme: () => undefined,
});

const STORAGE_KEY = "rp-theme";

function getStoredTheme(allowPersistence = false): Theme {
  if (!allowPersistence) return "system";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // localStorage may be unavailable in some contexts
  }
  return "system";
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: Theme): "light" | "dark" {
  return theme === "system" ? getSystemTheme() : theme;
}

function applyTheme(resolved: "light" | "dark") {
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { preferences } = useCookieConsent();
  const preferenceStorageAllowed = preferences?.preferences === true;
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => resolveTheme("system"));

  useEffect(() => {
    if (preferences === null) return;
    if (preferenceStorageAllowed) {
      setThemeState(getStoredTheme(true));
      return;
    }
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage may be unavailable */ }
  }, [preferences, preferenceStorageAllowed]);

  // Apply theme on mount and whenever it changes.
  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, [theme]);

  // Listen for system preference changes when theme is "system".
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const resolved = getSystemTheme();
      setResolvedTheme(resolved);
      applyTheme(resolved);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  function setTheme(next: Theme) {
    setThemeState(next);
    try {
      if (preferenceStorageAllowed) localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  function toggleTheme() {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Inline script to apply theme before React hydrates (prevents flash). */
export const themeInitScript = `
(function(){
  var d=window.matchMedia('(prefers-color-scheme:dark)').matches;
  if(d)document.documentElement.classList.add('dark');
})();
`;
