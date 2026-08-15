import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ServiceKey } from "@/lib/services";

const BASE =
  "group relative flex min-h-[92px] w-full flex-col justify-center rounded-xl border bg-surface p-4 text-left transition-all duration-200 hairline-top";

export function ServiceCard({
  label,
  blurb,
  selected,
  startingAt,
  onSelect,
  quoteServiceKey,
}: {
  label: string;
  blurb?: string;
  selected?: boolean;
  startingAt?: number | null;
  onSelect?: () => void;
  /**
   * When set, the card links into the existing quote flow with this category
   * preselected via `/quote?service=<key>`.
   */
  quoteServiceKey?: ServiceKey;
}) {
  const { t } = useI18n();

  const body = (
    <>
      <span className="font-display text-base font-semibold">{label}</span>
      {blurb && <span className="mt-1 text-sm text-muted-foreground">{blurb}</span>}
      {typeof startingAt === "number" && (
        <span className="mt-2 text-xs tracking-wide text-chrome uppercase">
          {t("common.startingAt")} ${startingAt}
        </span>
      )}
      {selected && (
        <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" />
        </span>
      )}
    </>
  );

  const interactive = "active:scale-[0.985] hover:border-chrome/50 hover:bg-accent/40";

  if (quoteServiceKey) {
    return (
      <Link
        to="/quote"
        search={{ service: quoteServiceKey }}
        className={cn(BASE, interactive, "border-border")}
      >
        {body}
      </Link>
    );
  }

  const Comp = onSelect ? "button" : "div";
  return (
    <Comp
      {...(onSelect ? { type: "button" as const, onClick: onSelect } : {})}
      className={cn(
        BASE,
        onSelect && interactive,
        selected ? "border-chrome bg-accent" : "border-border",
      )}
    >
      {body}
    </Comp>
  );
}
