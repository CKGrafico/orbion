import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enMessages from "./en.json";
import type { I18nMessage } from "../../../shared/ipc";

export const defaultLocale = "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: enMessages },
  },
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  interpolation: { escapeValue: false },
  keySeparator: ".",
  nsSeparator: ":",
});

export default i18n;

export function translateMessage(
  message: I18nMessage | string | null | undefined,
): string {
  if (!message) return "";
  if (typeof message === "string") return message;
  return i18n.t(message.key, message.params as Record<string, string | number> | undefined);
}
