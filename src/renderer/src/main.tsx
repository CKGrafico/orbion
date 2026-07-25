import "reflect-metadata";
import React from "react";
import { createRoot } from "react-dom/client";
import { IntlProvider } from "react-intl";
import { App } from "./App";
import { DIProvider } from "./services/DIProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { defaultLocale, messages } from "./i18n";
import "./globals.css";
import "./theme.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <ErrorBoundary>
        <IntlProvider locale={defaultLocale} messages={messages[defaultLocale]} defaultLocale={defaultLocale}>
          <DIProvider>
            <App />
          </DIProvider>
        </IntlProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
