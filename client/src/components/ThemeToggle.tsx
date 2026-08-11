import { useTheme } from "../lib/theme";

type AppearanceOption = "system" | "light" | "dark";

const APPEARANCE_OPTIONS: Array<{ value: AppearanceOption; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * Direct, labeled appearance selection. New visitors default to System through
 * the theme provider; this control makes all three choices immediately visible.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={`inline-flex items-center rounded-lg border border-line bg-surface-soft p-1 ${className}`}
    >
      {APPEARANCE_OPTIONS.map((option) => {
        const selected = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(option.value)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${selected ? "bg-teal text-white shadow-sm" : "text-body hover:bg-white hover:text-ink dark:hover:bg-slate-800"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
