import "reflect-metadata";
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DIProvider } from "./services/DIProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./i18n";
import "./globals.css";
import "./theme.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <ErrorBoundary>
        <DIProvider>
          <App />
        </DIProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
