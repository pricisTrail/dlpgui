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
  onClose,
  onToggleAria2c,
  onCheckUpdate,
  onUpdateYtdlp,
  onToggleAutoUpdate,
  onRefreshExtensionBridge,
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Settings className="h-5 w-5 text-indigo-400" />
            Settings
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 transition-colors hover:bg-slate-800">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 p-3">
            <div className="flex-1">
              <div className="text-sm font-medium">Use aria2c Downloader</div>
              <div className="mt-0.5 text-xs text-slate-500">
                Faster downloads with 16 parallel connections. Requires aria2c installed.
              </div>
            </div>
            <button
              onClick={onToggleAria2c}
              className={cn(
                "relative h-6 w-12 rounded-full transition-colors",
                useAria2c ? "bg-indigo-600" : "bg-slate-700",
              )}
            >
              <div
                className={cn(
                  "absolute top-1 h-4 w-4 rounded-full bg-white transition-transform",
                  useAria2c ? "translate-x-7" : "translate-x-1",
                )}
              />
            </button>
          </div>

          {useAria2c && (
            <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-3 text-xs text-slate-500">
              <div className="mb-1 font-medium text-slate-400">aria2c settings applied:</div>
              <ul className="list-inside list-disc space-y-0.5">
                <li>16 connections per server (-x16)</li>
                <li>16-way file splitting (-s16)</li>
                <li>1MB minimum split size (-k1M)</li>
                <li>Fast file allocation mode</li>
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium">yt-dlp Version</div>
              <button
                onClick={onCheckUpdate}
                disabled={isCheckingUpdate}
                className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
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

            {ytdlpVersion && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Current:</span>
                  <span className="font-mono text-slate-300">{ytdlpVersion}</span>
                </div>

                {ytdlpLatestVersion && ytdlpLatestVersion !== ytdlpVersion && (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Latest:</span>
                      <span className="font-mono text-emerald-400">{ytdlpLatestVersion}</span>
                    </div>
                    <button
                      onClick={onUpdateYtdlp}
                      disabled={isUpdating}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:bg-slate-700"
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
                  </>
                )}

                {ytdlpLatestVersion && ytdlpLatestVersion === ytdlpVersion && (
                  <div className="flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    Up to date
                  </div>
                )}
              </div>
            )}

            {updateError && (
              <div className="mt-2 rounded bg-rose-500/10 p-2 text-xs text-rose-400">{updateError}</div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-slate-700 pt-3">
              <div className="flex-1">
                <div className="text-xs text-slate-400">Auto-update on startup</div>
              </div>
              <button
                onClick={onToggleAutoUpdate}
                className={cn(
                  "relative h-5 w-10 rounded-full transition-colors",
                  autoUpdateYtdlp ? "bg-indigo-600" : "bg-slate-700",
                )}
              >
                <div
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                    autoUpdateYtdlp ? "translate-x-5" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Chrome Extension Bridge</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Loopback API for the companion extension in <span className="font-mono">extension/chrome</span>.
                </div>
              </div>
              <button onClick={onRefreshExtensionBridge} className="text-xs text-indigo-400 hover:text-indigo-300">
                Refresh
              </button>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-xs">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Endpoint</span>
                <span className="font-mono text-slate-300">
                  {extensionBridgeInfo?.endpoint || "http://127.0.0.1:46321"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Status</span>
                <span
                  className={cn(
                    "font-medium",
                    extensionBridgeInfo?.ready ? "text-emerald-400" : "text-amber-400",
                  )}
                >
                  {extensionBridgeInfo?.ready ? "Listening for Chrome" : "Not available"}
                </span>
              </div>
              {extensionBridgeInfo?.error && (
                <div className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-300">
                  {extensionBridgeInfo.error}
                </div>
              )}
            </div>

            <div className="space-y-1 text-xs text-slate-500">
              <div>Toolbar clicks send the active tab straight to the app.</div>
              <div>YouTube pages also get a branded quick action on watch pages.</div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 p-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-indigo-600 py-2 font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
