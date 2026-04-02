import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Settings,
  X,
} from "lucide-react";

import type { ExtensionBridgeInfo } from "../lib/types";
import { cn } from "../lib/utils";

export interface InterfacePreset {
  id: string;
  name: string;
  description: string;
  status: "active" | "saved";
}

interface SettingsModalProps {
  isOpen: boolean;
  useAria2c: boolean;
  autoUpdateYtdlp: boolean;
  ytdlpVersion: string;
  ytdlpLatestVersion: string;
  isCheckingUpdate: boolean;
  isUpdating: boolean;
  updateError: string;
  extensionBridgeInfo: ExtensionBridgeInfo | null;
  interfacePresets: InterfacePreset[];
  onClose: () => void;
  onToggleAria2c: () => void;
  onCheckUpdate: () => void;
  onUpdateYtdlp: () => void;
  onToggleAutoUpdate: () => void;
  onRefreshExtensionBridge: () => void;
}

export function SettingsModal({
  isOpen,
  useAria2c,
  autoUpdateYtdlp,
  ytdlpVersion,
  ytdlpLatestVersion,
  isCheckingUpdate,
  isUpdating,
  updateError,
  extensionBridgeInfo,
  interfacePresets,
  onClose,
  onToggleAria2c,
  onCheckUpdate,
  onUpdateYtdlp,
  onToggleAutoUpdate,
  onRefreshExtensionBridge,
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 p-4 backdrop-blur-sm dark:bg-[#0F0F0F]/80">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#EAEAEA] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-colors dark:border-[#2A2A2A] dark:bg-[#141414] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
        <div className="flex items-center justify-between border-b border-[#EAEAEA] px-6 py-4 transition-colors dark:border-[#2A2A2A]">
          <h2 className="flex items-center gap-2 font-serif text-xl tracking-tight text-[#111111] dark:text-[#EDEDED]">
            <Settings className="h-5 w-5" />
            Preferences
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[#787774] transition-colors hover:text-[#111111] dark:text-[#888888] dark:hover:text-[#EDEDED]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex max-h-[60vh] flex-col gap-8 overflow-y-auto p-6">
          <div className="space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-[0.22em] text-[#787774] dark:text-[#888888]">
              Interface presets
            </h3>
            <div className="grid gap-3">
              {interfacePresets.map((preset) => (
                <div
                  key={preset.id}
                  className="rounded-lg border border-[#EAEAEA] p-4 transition-colors dark:border-[#2A2A2A]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[#111111] dark:text-[#EDEDED]">
                        {preset.name}
                      </p>
                      <p className="mt-1 text-xs text-[#787774] dark:text-[#888888]">
                        {preset.description}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]",
                        preset.status === "active"
                          ? "bg-[#111111] text-white dark:bg-[#EDEDED] dark:text-[#111111]"
                          : "bg-[#F7F6F3] text-[#787774] dark:bg-[#1F1F1F] dark:text-[#888888]",
                      )}
                    >
                      {preset.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-[#787774] dark:text-[#888888]">
              The layout switcher will be exposed here later. Both presets are preserved.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-[0.22em] text-[#787774] dark:text-[#888888]">
              Core engine
            </h3>
            <div className="flex items-center justify-between rounded-lg border border-[#EAEAEA] p-4 transition-colors dark:border-[#2A2A2A]">
              <div>
                <p className="text-sm font-medium text-[#111111] dark:text-[#EDEDED]">
                  Use aria2c downloader
                </p>
                <p className="mt-1 text-xs text-[#787774] dark:text-[#888888]">
                  Enable 16 parallel connections for faster downloads.
                </p>
              </div>
              <button
                type="button"
                onClick={onToggleAria2c}
                className={cn(
                  "relative h-6 w-12 rounded-full transition-colors",
                  useAria2c ? "bg-[#111111] dark:bg-[#EDEDED]" : "bg-[#D6D3D1] dark:bg-[#2A2A2A]",
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 h-4 w-4 rounded-full bg-white transition-transform dark:bg-[#111111]",
                    useAria2c ? "translate-x-7" : "translate-x-1",
                  )}
                />
              </button>
            </div>

            <div className="rounded-lg border border-[#EAEAEA] bg-[#FBFBFA] p-4 transition-colors dark:border-[#2A2A2A] dark:bg-[#0F0F0F]">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#111111] dark:text-[#EDEDED]">
                    yt-dlp version
                  </p>
                  <p className="mt-1 font-mono text-xs text-[#787774] dark:text-[#888888]">
                    Current: {ytdlpVersion || "Unknown"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCheckUpdate}
                  disabled={isCheckingUpdate}
                  className="text-xs text-[#111111] transition-colors hover:text-[#333333] disabled:opacity-50 dark:text-[#EDEDED] dark:hover:text-white"
                >
                  {isCheckingUpdate ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Checking...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" />
                      Check for updates
                    </span>
                  )}
                </button>
              </div>

              {ytdlpLatestVersion && ytdlpLatestVersion !== ytdlpVersion && (
                <button
                  type="button"
                  onClick={onUpdateYtdlp}
                  disabled={isUpdating}
                  className="inline-flex items-center gap-2 rounded-md bg-[#111111] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:opacity-50 dark:bg-[#EDEDED] dark:text-[#111111] dark:hover:bg-white"
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Download className="h-3 w-3" />
                      Update to {ytdlpLatestVersion}
                    </>
                  )}
                </button>
              )}

              {ytdlpLatestVersion && ytdlpLatestVersion === ytdlpVersion && (
                <div className="flex items-center gap-1 text-xs text-[#346538] dark:text-[#76B87B]">
                  <CheckCircle2 className="h-3 w-3" />
                  Up to date
                </div>
              )}

              {updateError && (
                <div className="mt-3 rounded-md bg-[#FDEBEC] px-3 py-2 text-xs text-[#9F2F2D] dark:bg-[#331112] dark:text-[#E86B69]">
                  {updateError}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-[#EAEAEA] pt-4 transition-colors dark:border-[#2A2A2A]">
                <span className="text-xs text-[#787774] dark:text-[#888888]">
                  Auto-update on startup
                </span>
                <button
                  type="button"
                  onClick={onToggleAutoUpdate}
                  className={cn(
                    "relative h-5 w-10 rounded-full transition-colors",
                    autoUpdateYtdlp
                      ? "bg-[#111111] dark:bg-[#EDEDED]"
                      : "bg-[#D6D3D1] dark:bg-[#2A2A2A]",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform dark:bg-[#111111]",
                      autoUpdateYtdlp ? "translate-x-5" : "translate-x-0.5",
                    )}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-[0.22em] text-[#787774] dark:text-[#888888]">
              Integration
            </h3>
            <div className="rounded-lg border border-[#EAEAEA] p-4 transition-colors dark:border-[#2A2A2A]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[#111111] dark:text-[#EDEDED]">
                    Chrome extension bridge
                  </p>
                  <p className="mt-1 text-xs text-[#787774] dark:text-[#888888]">
                    Loopback API for the companion extension in <span className="font-mono">extension/chrome</span>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onRefreshExtensionBridge}
                  className="text-xs text-[#111111] transition-colors hover:text-[#333333] dark:text-[#EDEDED] dark:hover:text-white"
                >
                  Refresh
                </button>
              </div>

              <div className="rounded-md bg-[#111111] p-3 font-mono text-xs text-[#A1A1AA] transition-colors dark:bg-[#1F1F1F]">
                <div className="flex items-center justify-between gap-4">
                  <span>{extensionBridgeInfo?.endpoint || "http://127.0.0.1:46321"}</span>
                  <span
                    className={cn(
                      extensionBridgeInfo?.ready
                        ? "text-[#76B87B]"
                        : "text-[#E6B300]",
                    )}
                  >
                    {extensionBridgeInfo?.ready ? "Listening" : "Unavailable"}
                  </span>
                </div>
                {extensionBridgeInfo?.error && (
                  <div className="mt-2 text-[#E6B300]">{extensionBridgeInfo.error}</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-[#EAEAEA] bg-[#FBFBFA] px-6 py-4 transition-colors dark:border-[#2A2A2A] dark:bg-[#0F0F0F]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-[#111111] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] dark:bg-[#EDEDED] dark:text-[#111111] dark:hover:bg-white"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
