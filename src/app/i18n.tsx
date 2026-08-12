import { createContext, useContext } from 'react';

export type AppLanguage = 'es' | 'en';

interface AppLanguageContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
}

export const AppLanguageContext = createContext<AppLanguageContextValue>({
  language: 'es',
  setLanguage: () => {}
});

export function useAppLanguage() {
  return useContext(AppLanguageContext);
}
