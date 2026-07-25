import { BrowserWindow } from "electron";

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win;
  win.on("closed", () => {
    mainWindow = null;
  });
}

export function getMainWindow(): BrowserWindow | null {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  mainWindow = null;
  return null;
}
