import React from "react";
import { createRoot } from "react-dom/client";
import { IntlProvider } from "react-intl";
import { App } from "./App";
import { defaultLocale, messages } from "./i18n";
import "./theme.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <IntlProvider locale={defaultLocale} messages={messages[defaultLocale]} defaultLocale={defaultLocale}>
        <App />
      </IntlProvider>
    </React.StrictMode>,
  );
}
