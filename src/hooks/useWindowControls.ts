import type { MouseEvent } from "react";

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

export function useWindowControls() {
  const minimizeWindow = async () => {
    await appWindow.minimize();
  };

  const toggleMaximizeWindow = async () => {
    if (await appWindow.isMaximized()) {
      await appWindow.unmaximize();
      return;
    }

    await appWindow.maximize();
  };

  const closeWindow = async () => {
    await appWindow.close();
  };

  const quitApp = async () => {
    await invoke("exit_app");
  };

  const startWindowDrag = async (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    await appWindow.startDragging();
  };

  return {
    minimizeWindow,
    toggleMaximizeWindow,
    closeWindow,
    quitApp,
    startWindowDrag,
  };
}
