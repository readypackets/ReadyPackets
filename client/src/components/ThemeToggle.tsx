import { useState } from "react";
import { useTheme } from "../lib/theme";

type AppearanceOption = "system" | "light" | "dark";

const APPEARANCE_OPTIONS: Array<{ value: AppearanceOption; label: string; description: string }> = [
  { value: "system", label: "System", description: "Match this device" },
  { value: "light", label: "Light", description: "Always use light" },
  { value: "dark", label: "Dark", description: "Always use dark" },
];

function AppearanceIcon({ mode, className = "" }: { mode: AppearanceOption; className?: string }) {
  if (mode === "light") {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>;
  }
  if (mode === "dark") {
    return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>;
  }
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" strokeWidth={2} /><path strokeLinecap="round" strokeWidth={2} d="M8 21h8M12 17v4" /></svg>;
}

/** Persistent appearance picker. System is deliberately the default for new visitors. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
        aria-label={`Appearance: ${theme}. Choose System, Light, or Dark mode`}
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
      >
        <AppearanceIcon mode={theme === "system" ? "system" : resolvedTheme} className="size-5" />
      </button>
      {open ? (
        <div role="menu" aria-label="Appearance" className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-line bg-white p-2 shadow-lg dark:bg-slate-900">
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted">Appearance</p>
          {APPEARANCE_OPTIONS.map((option) => {
            const active = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => { setTheme(option.value); setOpen(false); }}
                className={`mt-1 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${active ? "bg-teal/10 text-teal-dark" : "text-body hover:bg-surface-soft hover:text-ink"}`}
              >
                <AppearanceIcon mode={option.value} className="size-4 shrink-0" />
                <span className="min-w-0"><span className="block text-sm font-medium">{option.label}</span><span className="block text-xs text-muted">{option.description}</span></span>
                {active ? <span className="ml-auto text-xs font-semibold">Selected</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
