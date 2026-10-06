"use client";

import { createContext, createElement, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type InterfaceLanguage = "zh" | "en";

type InterfaceLanguageContextValue = {
  language: InterfaceLanguage;
  setLanguage: (language: InterfaceLanguage) => void;
};

const InterfaceLanguageContext = createContext<InterfaceLanguageContextValue | null>(null);

export function InterfaceLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<InterfaceLanguage>("en");

  useEffect(() => {
    let active = true;
    void fetch("/api/settings", { cache: "no-store" })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then((value: { language?: string }) => {
        if (!active) return;
        const next = value.language === "zh" ? "zh" : "en";
        setLanguage(next);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage }), [language]);
  return createElement(InterfaceLanguageContext.Provider, { value }, children);
}

export function useInterfaceLanguage() {
  return useInterfaceLanguageContext().language;
}

export function useSetInterfaceLanguage() {
  return useInterfaceLanguageContext().setLanguage;
}

function useInterfaceLanguageContext() {
  const context = useContext(InterfaceLanguageContext);
  if (!context) throw new Error("useInterfaceLanguage must be used within InterfaceLanguageProvider.");
  return context;
}

export function localized<T>(language: InterfaceLanguage, copy: { en: T; zh: T }) {
  return copy[language];
}
