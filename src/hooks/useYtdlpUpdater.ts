import { useEffect, useState } from "react";

import { invoke } from "@tauri-apps/api/core";

export function useYtdlpUpdater() {
  const [ytdlpVersion, setYtdlpVersion] = useState("");
  const [ytdlpLatestVersion, setYtdlpLatestVersion] = useState("");
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [autoUpdateYtdlp, setAutoUpdateYtdlp] = useState<boolean>(() => {
    const saved = localStorage.getItem("autoUpdateYtdlp");
    return saved !== null ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem("autoUpdateYtdlp", JSON.stringify(autoUpdateYtdlp));
  }, [autoUpdateYtdlp]);

  const checkYtdlpUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateError("");

    try {
      const result = await invoke<{
        current_version: string;
        latest_version: string;
        update_available: boolean;
      }>("check_ytdlp_update");

      setYtdlpVersion(result.current_version);
      setYtdlpLatestVersion(result.latest_version);
      return result;
    } catch (error) {
      console.error("Failed to check for updates:", error);
      setUpdateError(String(error));
      return null;
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const updateYtdlp = async () => {
    setIsUpdating(true);
    setUpdateError("");

    try {
      const newVersion = await invoke<string>("update_ytdlp");
      setYtdlpVersion(newVersion);
      setYtdlpLatestVersion(newVersion);
      return newVersion;
    } catch (error) {
      console.error("Failed to update yt-dlp:", error);
      setUpdateError(String(error));
      return null;
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    if (!autoUpdateYtdlp) return;

    const autoUpdate = async () => {
      const result = await checkYtdlpUpdate();
      if (result?.update_available) {
        await updateYtdlp();
      }
    };

    void autoUpdate();
  }, [autoUpdateYtdlp]);

  return {
    ytdlpVersion,
    ytdlpLatestVersion,
    isCheckingUpdate,
    isUpdating,
    updateError,
    autoUpdateYtdlp,
    setAutoUpdateYtdlp,
    checkYtdlpUpdate,
    updateYtdlp,
  };
}
