import { createIntl, type IntlShape, type ResolvedIntlConfig } from "react-intl";
import enMessages from "./en.json";
import type { I18nMessage } from "../../../shared/ipc";

export const defaultLocale = "en";
export const messages: Record<string, Record<string, unknown>> = {
  en: enMessages,
};

const intlConfig: ResolvedIntlConfig = {
  locale: defaultLocale,
  messages: messages[defaultLocale],
  defaultLocale,
};

const standaloneIntl: IntlShape = createIntl(intlConfig);

export function translateMessage(intl: IntlShape, message: I18nMessage | string | null | undefined): string {
  if (!message) return "";
  if (typeof message === "string") return message;
  return intl.formatMessage({ id: message.key }, message.params as Record<string, string | number> | undefined);
}

export { standaloneIntl };
