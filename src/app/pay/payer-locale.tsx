"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { payerCopy, type PayerLocale } from "@/lib/rent-advance/copy";

const LOCALE_LABELS: Record<PayerLocale, string> = {
  en: "English",
  nl: "Nederlands",
  pap: "Papiamentu",
};

const LOCALE_HTML: Record<PayerLocale, string> = {
  en: "en",
  nl: "nl",
  pap: "pap",
};

type PayerLocaleContextValue = {
  locale: PayerLocale;
  setLocale: (locale: PayerLocale) => void;
  copy: (typeof payerCopy)[PayerLocale];
};

const PayerLocaleContext = createContext<PayerLocaleContextValue | null>(null);

export function PayerLocaleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, setLocale] = useState<PayerLocale>("en");
  const value = useMemo(
    () => ({ locale, setLocale, copy: payerCopy[locale] }),
    [locale],
  );

  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = LOCALE_HTML[locale];
    return () => {
      document.documentElement.lang = previous;
    };
  }, [locale]);

  return (
    <PayerLocaleContext.Provider value={value}>
      {children}
    </PayerLocaleContext.Provider>
  );
}

export function usePayerLocale() {
  const context = useContext(PayerLocaleContext);
  if (!context) {
    throw new Error("usePayerLocale must be used within PayerLocaleProvider");
  }
  return context;
}

export function LanguageToggle() {
  const { locale, setLocale } = usePayerLocale();

  return (
    <div className="flex gap-2" role="group" aria-label="Language">
      {(["en", "nl", "pap"] as const).map((code) => (
        <Button
          key={code}
          type="button"
          size="sm"
          variant={locale === code ? "default" : "outline"}
          aria-pressed={locale === code}
          onClick={() => setLocale(code)}
        >
          {LOCALE_LABELS[code]}
        </Button>
      ))}
    </div>
  );
}
