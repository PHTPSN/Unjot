"use client";

import { useEffect, useState } from "react";

export type InterfaceLanguage = "zh" | "en";

export function useInterfaceLanguage() {
  const [language, setLanguage] = useState<InterfaceLanguage>("en");
  useEffect(() => {
    let active = true;
    void fetch("/api/settings", { cache: "no-store" })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then((value: { language?: string }) => {
        if (!active) return;
        const next = value.language === "zh" ? "zh" : "en";
        setLanguage(next);
        document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  return language;
}

export function localized<T>(language: InterfaceLanguage, copy: { en: T; zh: T }) {
  return copy[language];
}
