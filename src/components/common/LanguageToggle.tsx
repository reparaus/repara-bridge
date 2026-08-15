import { Languages } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Compact EN / ES switch for the public site. Persists through the language
 * provider, so the choice follows the visitor across every public route.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-full border border-border/70 bg-surface/60 p-0.5",
        className,
      )}
      role="group"
      aria-label={t("lang.label")}
    >
      <Languages className="ml-1.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      {(
        [
          { value: "en", short: "EN", label: t("lang.switchToEnglish") },
          { value: "es", short: "ES", label: t("lang.switchToSpanish") },
        ] as const
      ).map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setLang(option.value)}
          aria-pressed={lang === option.value}
          aria-label={option.label}
          className={cn(
            "rounded-full px-2 py-1 text-[11px] font-semibold tracking-[0.1em] transition-colors",
            lang === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.short}
        </button>
      ))}
    </div>
  );
}
