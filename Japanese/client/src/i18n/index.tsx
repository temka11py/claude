import { createContext, useContext, type ReactNode } from 'react';

export type Lang = 'mn' | 'en';

interface I18n {
  lang: Lang;
  /** Pick the Mongolian or English variant of a UI string. */
  L: (mn: string, en: string) => string;
}

const I18nContext = createContext<I18n>({ lang: 'mn', L: (mn) => mn });

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value: I18n = { lang, L: (mn, en) => (lang === 'en' ? en : mn) };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
