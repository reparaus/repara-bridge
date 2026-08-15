import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { rankSuggestions } from "@/lib/vehicle-data";

/**
 * A free-typing combobox: the text input is always authoritative, suggestions
 * only assist. Nothing is auto-selected, nothing is rewritten while typing, and
 * a value that isn't in the list is perfectly valid.
 *
 * Semantics follow the ARIA 1.2 editable-combobox pattern (`aria-expanded`,
 * `aria-controls`, `aria-activedescendant` on the input; `listbox`/`option` on
 * the popup) so screen readers announce the filtered results.
 */
export function ComboboxInput({
  id,
  value,
  onChange,
  options,
  loading = false,
  placeholder,
  inputMode,
  maxLength,
  autoCapitalize,
  limit = 8,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  options: string[];
  /** Shows an inline indicator while async suggestions load; typing stays live. */
  loading?: boolean;
  placeholder?: string;
  inputMode?: "text" | "numeric";
  maxLength?: number;
  autoCapitalize?: "none" | "words" | "characters";
  /** How many suggestions render before the list scrolls. */
  limit?: number;
  describedBy?: string;
}) {
  const { t } = useI18n();
  const listId = `${useId()}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(
    () => rankSuggestions(options, value, Math.max(limit * 4, 40)),
    [options, value, limit],
  );

  // Close on outside pointer down — more reliable on mobile than blur, which
  // fires before the option's click handler can run.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function commit(option: string) {
    onChange(option);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(event.key === "ArrowDown" ? 0 : results.length - 1);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = active + step;
      setActive(next < 0 ? results.length - 1 : next >= results.length ? 0 : next);
      return;
    }
    if (event.key === "Enter") {
      // Only intercept Enter while a suggestion is highlighted; otherwise the
      // typed value stands and the form keeps its normal submit behaviour.
      if (open && active >= 0 && results[active]) {
        event.preventDefault();
        commit(results[active]);
      }
      return;
    }
    if (event.key === "Escape") {
      if (open) {
        event.stopPropagation();
        setOpen(false);
        setActive(-1);
      }
      return;
    }
    if (event.key === "Tab") setOpen(false);
  }

  const activeId = open && active >= 0 && results[active] ? `${listId}-${active}` : undefined;

  return (
    <div className="relative" ref={wrapRef}>
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-describedby={describedBy}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode={inputMode}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        placeholder={placeholder}
        value={value}
        className="h-12 pr-10"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          // Let an option's pointerdown commit first, then close for keyboard or
          // mobile focus changes while preserving any free-typed value.
          window.setTimeout(() => {
            if (!wrapRef.current?.contains(document.activeElement)) {
              setOpen(false);
              setActive(-1);
            }
          }, 0);
        }}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          const next = event.target.value;
          const exactMatch = options.find(
            (option) => option.toLowerCase() === next.trim().toLowerCase(),
          );
          onChange(exactMatch ?? next);
          // A complete known value resolves immediately. Focusing/clicking the
          // completed field later intentionally opens it again for editing.
          setOpen(!exactMatch);
          setActive(-1);
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-3 flex h-12 items-center text-muted-foreground"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <ChevronDown className="size-4" />}
      </span>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          {loading && results.length === 0 && (
            <p className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> {t("quote.vehicle.loadingOptions")}
            </p>
          )}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={placeholder}
            className="max-h-[42vh] overflow-y-auto overscroll-contain"
          >
            {results.map((option, index) => {
              const selected = option.toLowerCase() === value.trim().toLowerCase();
              return (
                <li
                  key={option}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={selected}
                  // pointerdown fires before the input's blur, so the tap lands.
                  onPointerDown={(event) => {
                    event.preventDefault();
                    commit(option);
                  }}
                  onMouseEnter={() => setActive(index)}
                  className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 text-sm ${
                    index === active ? "bg-accent" : ""
                  }`}
                >
                  <span>{option}</span>
                  {selected && <Check className="size-4 shrink-0 text-chrome" />}
                </li>
              );
            })}
          </ul>
          {!loading && results.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              {t("quote.vehicle.noMatches")}
            </p>
          )}
          {loading && results.length > 0 && (
            <p className="flex items-center gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> {t("quote.vehicle.loadingOptions")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
