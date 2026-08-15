/**
 * Lightweight i18n for the public Repara site (English / Spanish).
 *
 * Deliberately dependency-free: one dictionary per language, a context provider
 * that persists the choice, and a `t("a.b.c")` lookup with `{token}` params.
 * Admin surfaces stay English and simply don't use these hooks.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { en, type Dictionary } from "./en";
import { es } from "./es";

export type Language = "en" | "es";

export const LANGUAGES: Language[] = ["en", "es"];
const STORAGE_KEY = "repara.lang";

const DICTIONARIES: Record<Language, Dictionary> = { en, es };

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "es";
}

/** Best-effort language guess from the browser, defaulting to English. */
function detectLanguage(): Language {
  if (typeof navigator === "undefined") return "en";
  const langs = [navigator.language, ...(navigator.languages ?? [])];
  return langs.some((l) => typeof l === "string" && l.toLowerCase().startsWith("es")) ? "es" : "en";
}

function lookup(dict: Dictionary, path: string): string | undefined {
  let node: unknown = dict;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export type TranslateParams = Record<string, string | number>;

export function translate(lang: Language, path: string, params?: TranslateParams): string {
  const value = lookup(DICTIONARIES[lang], path) ?? lookup(en, path);
  if (value === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${path}`);
    return path;
  }
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

interface I18nValue {
  lang: Language;
  setLang: (next: Language) => void;
  t: (path: string, params?: TranslateParams) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Renders with `en` on the server and during first paint, then adopts the
 * stored / detected language after hydration so SSR markup always matches.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");

  useEffect(() => {
    let next: Language | null = null;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isLanguage(stored)) next = stored;
    } catch {
      // Private mode / storage disabled — fall back to detection.
    }
    setLangState(next ?? detectLanguage());
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the choice just won't persist.
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t: (path, params) => translate(lang, path, params) }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Usable outside the provider (admin, isolated components): defaults to English. */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  return {
    lang: "en",
    setLang: () => {},
    t: (path, params) => translate("en", path, params),
  };
}

export function useT() {
  return useI18n().t;
}
