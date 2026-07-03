import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/geist-mono/index.css";
import "@velata/ui/globals.css";

import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Settings } from "@/components/settings/settings";
import { SettingsProvider } from "@/hooks/use-settings";

import { App } from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

const isSettingsWindow = getCurrentWindow().label === "settings";

createRoot(rootElement).render(
  <StrictMode>
    <SettingsProvider>{isSettingsWindow ? <Settings /> : <App />}</SettingsProvider>
  </StrictMode>,
);
