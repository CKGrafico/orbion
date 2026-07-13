import { createContext, useContext } from "react";
import { createIntl, type IntlShape, type ResolvedIntlConfig } from "react-intl";
import enMessages from "./en.json";
import type { I18nMessage } from "../../../shared/ipc";

export type Messages = typeof enMessages;

export const defaultLocale = "en";
export const messages: Record<string, Record<string, unknown>> = {
  en: enMessages,
};

export const intlConfig: ResolvedIntlConfig = {
  locale: defaultLocale,
  messages: messages[defaultLocale],
  defaultLocale,
};

// Standalone intl instance for use outside React components (utility files, notifications)
export const standaloneIntl: IntlShape = createIntl(intlConfig);

// Context for accessing intl in non-component code
export const IntlContext = createContext<IntlShape>(standaloneIntl);

export function useI18n(): IntlShape {
  return useContext(IntlContext);
}

export function translateMessage(intl: IntlShape, message: I18nMessage | null | undefined): string {
  if (!message) return "";
  return intl.formatMessage({ id: message.key }, message.params as Record<string, string | number | Date> | undefined);
}

export { enMessages };
