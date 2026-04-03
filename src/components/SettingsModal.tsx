import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Settings,
  X,
} from "lucide-react";

import { ToggleSwitch } from "./ToggleSwitch";
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
  layoutPreset: "glass" | "notion";
  isDarkMode: boolean;
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
  onSwitchPreset: (presetId: string) => void;
}

export function SettingsModal({
  isOpen,
  layoutPreset,
  isDarkMode,
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
  onSwitchPreset,
}: SettingsModalProps) {
  if (!isOpen) return null;

  const isGlassLayout = layoutPreset === "glass";
  const isLightMode = !isDarkMode;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4",
        isGlassLayout
          ? isLightMode
            ? "bg-[#f6f1e8]/70 backdrop-blur-xl"
            : "bg-[#05060a]/72 backdrop-blur-xl"
          : "bg-white/80 backdrop-blur-sm dark:bg-[#0F0F0F]/80",
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={cn(
          "relative flex max-h-[84vh] w-full flex-col overflow-hidden transition-colors",
          isGlassLayout
            ? cn(
                "max-w-3xl rounded-[2rem] border backdrop-blur-3xl",
                isLightMode
                  ? "border-stone-300/80 bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_28px_70px_-28px_rgba(120,101,79,0.42)]"
                  : "border-white/10 bg-zinc-900/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_60px_-24px_rgba(0,0,0,0.65)]",
              )
            : "max-w-2xl rounded-xl border border-[#EAEAEA] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:border-[#2A2A2A] dark:bg-[#141414] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)]",
        )}
      >
        {isGlassLayout && (
          <>
            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 h-44",
                isLightMode
                  ? "bg-[radial-gradient(circle_at_top_left,rgba(194,145,91,0.18),transparent_55%),radial-gradient(circle_at_top_right,rgba(132,169,140,0.16),transparent_42%)]"
                  : "bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_50%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_45%)]",
              )}
            />
            <div
              className={cn(
                "pointer-events-none absolute inset-0 opacity-[0.03] [background-image:linear-gradient(rgba(68,64,60,0.24)_1px,transparent_1px),linear-gradient(90deg,rgba(68,64,60,0.24)_1px,transparent_1px)] [background-size:72px_72px]",
                !isLightMode &&
                  "opacity-[0.04] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)]",
              )}
            />
          </>
        )}

        <div
          className={cn(
            "relative flex items-center justify-between px-6 py-4 transition-colors",
            isGlassLayout
              ? isLightMode
                ? "border-b border-stone-300/70"
                : "border-b border-white/10"
              : "border-b border-[#EAEAEA] dark:border-[#2A2A2A]",
          )}
        >
          <div>
            {isGlassLayout && (
              <p
                className={cn(
                  "mb-1 text-[10px] font-bold uppercase tracking-[0.28em]",
                  isLightMode ? "text-stone-500" : "text-zinc-500",
                )}
              >
                Control room
              </p>
            )}
            <h2
              className={cn(
                "flex items-center gap-2 tracking-tight",
                isGlassLayout
                  ? isLightMode
                    ? "font-serif text-[1.65rem] text-stone-900"
                    : "font-serif text-[1.65rem] text-zinc-50"
                  : "font-serif text-xl text-[#111111] dark:text-[#EDEDED]",
              )}
            >
              <Settings className="h-5 w-5" />
              Preferences
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "transition-colors",
              isGlassLayout
                ? isLightMode
                  ? "text-stone-500 hover:text-stone-900"
                  : "text-zinc-500 hover:text-zinc-100"
                : "text-[#787774] hover:text-[#111111] dark:text-[#888888] dark:hover:text-[#EDEDED]",
            )}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="settings-scroll relative flex max-h-[64vh] flex-col gap-6 overflow-y-auto p-6">
          <div
            className={cn(
              "space-y-4",
              isGlassLayout &&
                (isLightMode
                  ? "rounded-[1.75rem] border border-stone-300/80 bg-white/58 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
                  : "rounded-[1.75rem] border border-white/10 bg-zinc-950/38 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"),
            )}
          >
            <div
              className={cn(
                isGlassLayout && "flex items-start justify-between gap-4",
              )}
            >
              <div>
                <h3
                  className={cn(
                    "text-xs font-mono uppercase tracking-[0.22em]",
                    isGlassLayout
                      ? isLightMode
                        ? "text-stone-500"
                        : "text-zinc-500"
                      : "text-[#787774] dark:text-[#888888]",
                  )}
                >
                  Interface presets
                </h3>
                {isGlassLayout && (
                  <p
                    className={cn(
                      "mt-2 max-w-md text-sm",
                      isLightMode ? "text-stone-600" : "text-zinc-400",
                    )}
                  >
                    Switch the shell language without falling back to the
                    workspace list styling.
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-3">
              {interfacePresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSwitchPreset(preset.id)}
                  className={cn(
                    "w-full text-left transition-all duration-200",
                    preset.status === "active"
                      ? isGlassLayout
                        ? isLightMode
                          ? "rounded-[1.4rem] border border-stone-400/90 bg-white/88 p-4 shadow-[0_18px_35px_-28px_rgba(68,64,60,0.55)]"
                          : "rounded-[1.4rem] border border-white/15 bg-zinc-950/70 p-4 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.75)]"
                        : "rounded-lg border border-[#111111] bg-[#F7F6F3] p-4 shadow-[0_0_0_1px_#111111] dark:border-[#EDEDED] dark:bg-[#1F1F1F] dark:shadow-[0_0_0_1px_#EDEDED]"
                      : isGlassLayout
                        ? isLightMode
                          ? "rounded-[1.4rem] border border-stone-300/80 bg-white/52 p-4 hover:border-stone-400 hover:bg-white/72"
                          : "rounded-[1.4rem] border border-white/8 bg-zinc-950/28 p-4 hover:border-white/15 hover:bg-zinc-950/45"
                        : "rounded-lg border border-[#EAEAEA] p-4 hover:border-[#CCCCCC] hover:bg-[#FBFBFA] dark:border-[#2A2A2A] dark:hover:border-[#444444] dark:hover:bg-[#1A1A1A]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p
                        className={cn(
                          "text-sm font-medium",
                          isGlassLayout
                            ? isLightMode
                              ? "text-stone-900"
                              : "text-zinc-100"
                            : "text-[#111111] dark:text-[#EDEDED]",
                        )}
                      >
                        {preset.name}
                      </p>
                      <p
                        className={cn(
                          "mt-1 text-xs",
                          isGlassLayout
                            ? isLightMode
                              ? "text-stone-600"
                              : "text-zinc-400"
                            : "text-[#787774] dark:text-[#888888]",
                        )}
                      >
                        {preset.description}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
                        preset.status === "active"
                          ? isGlassLayout
                            ? isLightMode
                              ? "bg-stone-900 text-stone-50"
                              : "bg-zinc-100 text-zinc-950"
                            : "bg-[#111111] text-white dark:bg-[#EDEDED] dark:text-[#111111]"
                          : isGlassLayout
                            ? isLightMode
                              ? "bg-stone-100 text-stone-500"
                              : "bg-zinc-800 text-zinc-400"
                            : "bg-[#F7F6F3] text-[#787774] dark:bg-[#1F1F1F] dark:text-[#888888]",
                      )}
                    >
                      {preset.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <p
              className={cn(
                "text-xs",
                isGlassLayout
                  ? isLightMode
                    ? "text-stone-500"
                    : "text-zinc-500"
                  : "text-[#787774] dark:text-[#888888]",
              )}
            >
              Click a preset to switch the interface layout. Your preference is
              saved automatically.
            </p>
          </div>

          <div
            className={cn(
              "space-y-4",
              isGlassLayout &&
                (isLightMode
                  ? "rounded-[1.75rem] border border-stone-300/80 bg-white/58 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
                  : "rounded-[1.75rem] border border-white/10 bg-zinc-950/38 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"),
            )}
          >
            <h3
              className={cn(
                "text-xs font-mono uppercase tracking-[0.22em]",
                isGlassLayout
                  ? isLightMode
                    ? "text-stone-500"
                    : "text-zinc-500"
                  : "text-[#787774] dark:text-[#888888]",
              )}
            >
              Core engine
            </h3>
            <div
              className={cn(
                "flex items-center justify-between p-4 transition-colors",
                isGlassLayout
                  ? isLightMode
                    ? "rounded-[1.35rem] border border-stone-300/80 bg-[#fcfaf7]"
                    : "rounded-[1.35rem] border border-white/10 bg-zinc-950/45"
                  : "rounded-lg border border-[#EAEAEA] dark:border-[#2A2A2A]",
              )}
            >
              <div>
                <p
                  className={cn(
                    "text-sm font-medium",
                    isGlassLayout
                      ? isLightMode
                        ? "text-stone-900"
                        : "text-zinc-100"
                      : "text-[#111111] dark:text-[#EDEDED]",
                  )}
                >
                  Use aria2c downloader
                </p>
                <p
                  className={cn(
                    "mt-1 text-xs",
                    isGlassLayout
                      ? isLightMode
                        ? "text-stone-600"
                        : "text-zinc-400"
                      : "text-[#787774] dark:text-[#888888]",
                  )}
                >
                  Enable 16 parallel connections for faster downloads.
                </p>
              </div>
              <ToggleSwitch
                checked={useAria2c}
                onToggle={onToggleAria2c}
                ariaLabel="Use aria2c downloader"
                tone={isLightMode ? "light" : "dark"}
                size="sm"
              />
            </div>

            <div
              className={cn(
                "p-4 transition-colors",
                isGlassLayout
                  ? isLightMode
                    ? "rounded-[1.35rem] border border-stone-300/80 bg-[#fcfaf7]"
                    : "rounded-[1.35rem] border border-white/10 bg-zinc-950/45"
                  : "rounded-lg border border-[#EAEAEA] bg-[#FBFBFA] dark:border-[#2A2A2A] dark:bg-[#0F0F0F]",
              )}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p
                    className={cn(
                      "text-sm font-medium",
                      isGlassLayout
                        ? isLightMode
                          ? "text-stone-900"
                          : "text-zinc-100"
                        : "text-[#111111] dark:text-[#EDEDED]",
                    )}
                  >
                    yt-dlp version
                  </p>
                  <p
                    className={cn(
                      "mt-1 font-mono text-xs",
                      isGlassLayout
                        ? isLightMode
                          ? "text-stone-500"
                          : "text-zinc-500"
                        : "text-[#787774] dark:text-[#888888]",
                    )}
                  >
                    Current: {ytdlpVersion || "Unknown"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCheckUpdate}
                  disabled={isCheckingUpdate}
                  className={cn(
                    "text-xs transition-colors disabled:opacity-50",
                    isGlassLayout
                      ? isLightMode
                        ? "text-stone-700 hover:text-stone-900"
                        : "text-zinc-300 hover:text-white"
                      : "text-[#111111] hover:text-[#333333] dark:text-[#EDEDED] dark:hover:text-white",
                  )}
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
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50",
                    isGlassLayout
                      ? isLightMode
                        ? "bg-stone-900 text-stone-50 hover:bg-stone-700"
                        : "bg-zinc-100 text-zinc-950 hover:bg-white"
                      : "bg-[#111111] text-white hover:bg-[#333333] dark:bg-[#EDEDED] dark:text-[#111111] dark:hover:bg-white",
                  )}
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
                <div
                  className={cn(
                    "flex items-center gap-1 text-xs",
                    isGlassLayout
                      ? isLightMode
                        ? "text-emerald-700"
                        : "text-emerald-300"
                      : "text-[#346538] dark:text-[#76B87B]",
                  )}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Up to date
                </div>
              )}

              {updateError && (
                <div
                  className={cn(
                    "mt-3 rounded-md px-3 py-2 text-xs",
                    isGlassLayout
                      ? isLightMode
                        ? "bg-red-50 text-red-700"
                        : "bg-red-500/10 text-red-300"
                      : "bg-[#FDEBEC] text-[#9F2F2D] dark:bg-[#331112] dark:text-[#E86B69]",
                  )}
                >
                  {updateError}
                </div>
              )}

              <div
                className={cn(
                  "mt-4 flex items-center justify-between pt-4 transition-colors",
                  isGlassLayout
                    ? isLightMode
                      ? "border-t border-stone-300/80"
                      : "border-t border-white/10"
                    : "border-t border-[#EAEAEA] dark:border-[#2A2A2A]",
                )}
              >
                <span
                  className={cn(
                    "text-xs",
                    isGlassLayout
                      ? isLightMode
                        ? "text-stone-600"
                        : "text-zinc-400"
                      : "text-[#787774] dark:text-[#888888]",
                  )}
                >
                  Auto-update on startup
                </span>
                <ToggleSwitch
                  checked={autoUpdateYtdlp}
                  onToggle={onToggleAutoUpdate}
                  ariaLabel="Auto-update on startup"
                  tone={isLightMode ? "light" : "dark"}
                  size="sm"
                />
              </div>
            </div>
          </div>

          <div
            className={cn(
              "space-y-4",
              isGlassLayout &&
                (isLightMode
                  ? "rounded-[1.75rem] border border-stone-300/80 bg-white/58 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
                  : "rounded-[1.75rem] border border-white/10 bg-zinc-950/38 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"),
            )}
          >
            <h3
              className={cn(
                "text-xs font-mono uppercase tracking-[0.22em]",
                isGlassLayout
                  ? isLightMode
                    ? "text-stone-500"
                    : "text-zinc-500"
                  : "text-[#787774] dark:text-[#888888]",
              )}
            >
              Integration
            </h3>
            <div
              className={cn(
                "p-4 transition-colors",
                isGlassLayout
                  ? isLightMode
                    ? "rounded-[1.35rem] border border-stone-300/80 bg-[#fcfaf7]"
                    : "rounded-[1.35rem] border border-white/10 bg-zinc-950/45"
                  : "rounded-lg border border-[#EAEAEA] dark:border-[#2A2A2A]",
              )}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p
                    className={cn(
                      "text-sm font-medium",
                      isGlassLayout
                        ? isLightMode
                          ? "text-stone-900"
                          : "text-zinc-100"
                        : "text-[#111111] dark:text-[#EDEDED]",
                    )}
                  >
                    Chrome extension bridge
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-xs",
                      isGlassLayout
                        ? isLightMode
                          ? "text-stone-600"
                          : "text-zinc-400"
                        : "text-[#787774] dark:text-[#888888]",
                    )}
                  >
                    Loopback API for the companion extension in{" "}
                    <span className="font-mono">extension/chrome</span>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onRefreshExtensionBridge}
                  className={cn(
                    "text-xs transition-colors",
                    isGlassLayout
                      ? isLightMode
                        ? "text-stone-700 hover:text-stone-900"
                        : "text-zinc-300 hover:text-white"
                      : "text-[#111111] hover:text-[#333333] dark:text-[#EDEDED] dark:hover:text-white",
                  )}
                >
                  Refresh
                </button>
              </div>

              <div
                className={cn(
                  "rounded-md p-3 font-mono text-xs transition-colors",
                  isGlassLayout
                    ? isLightMode
                      ? "border border-stone-300/80 bg-white/80 text-stone-600"
                      : "border border-white/10 bg-zinc-900/80 text-zinc-400"
                    : "bg-[#111111] text-[#A1A1AA] dark:bg-[#1F1F1F]",
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  <span>
                    {extensionBridgeInfo?.endpoint || "http://127.0.0.1:46321"}
                  </span>
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
                  <div className="mt-2 text-[#E6B300]">
                    {extensionBridgeInfo.error}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          className={cn(
            "relative flex justify-end px-6 py-4 transition-colors",
            isGlassLayout
              ? isLightMode
                ? "border-t border-stone-300/70 bg-white/46"
                : "border-t border-white/10 bg-zinc-950/30"
              : "border-t border-[#EAEAEA] bg-[#FBFBFA] dark:border-[#2A2A2A] dark:bg-[#0F0F0F]",
          )}
        >
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              isGlassLayout
                ? isLightMode
                  ? "rounded-xl bg-stone-900 text-stone-50 hover:bg-stone-700"
                  : "rounded-xl bg-zinc-100 text-zinc-950 hover:bg-white"
                : "rounded-md bg-[#111111] text-white hover:bg-[#333333] dark:bg-[#EDEDED] dark:text-[#111111] dark:hover:bg-white",
            )}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
