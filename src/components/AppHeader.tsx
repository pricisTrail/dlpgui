import type { MouseEvent } from "react";

import { Download, Folder, FolderOpen, Minus, Settings, Square, X } from "lucide-react";

interface AppHeaderProps {
  extensionActivity: string;
  savePath: string;
  onOpenFolder: (path: string) => void;
  onSelectFolder: () => void;
  onOpenSettings: () => void;
  onStartDrag: (event: MouseEvent<HTMLDivElement>) => void;
  onToggleMaximize: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

export function AppHeader({
  extensionActivity,
  savePath,
  onOpenFolder,
  onSelectFolder,
  onOpenSettings,
  onStartDrag,
  onToggleMaximize,
  onMinimize,
  onClose,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/50 pb-6 pl-6 pr-40 pt-11 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <div
          className="flex min-w-0 flex-1 cursor-grab items-center gap-3 select-none active:cursor-grabbing"
          data-tauri-drag-region
          onMouseDown={onStartDrag}
          onDoubleClick={onToggleMaximize}
        >
          <div className="rounded-lg bg-indigo-600 p-2">
            <Download className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">yt-dlp GUI</h1>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
              {extensionActivity && <span className="truncate text-slate-400">{extensionActivity}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5">
            <Folder className="h-4 w-4 text-slate-400" />
            <span className="max-w-[200px] truncate text-xs text-slate-300">{savePath}</span>
            <button
              onClick={() => onOpenFolder(savePath)}
              className="ml-1 rounded p-1 transition-colors hover:bg-slate-700"
              title="Open folder"
            >
              <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
            </button>
            <button
              onClick={onSelectFolder}
              className="rounded bg-slate-700 px-2 py-0.5 text-[10px] transition-colors hover:bg-slate-600"
            >
              Change
            </button>
          </div>

          <button onClick={onOpenSettings} className="rounded-full p-2 transition-colors hover:bg-slate-800">
            <Settings className="h-5 w-5 text-slate-400" />
          </button>
        </div>
      </div>

      <div className="absolute right-0 top-1 z-20 flex items-stretch select-none">
        <button
          onClick={onMinimize}
          className="flex h-10 w-12 items-center justify-center text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          title="Minimize"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={onToggleMaximize}
          className="flex h-10 w-12 items-center justify-center text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          title="Maximize"
        >
          <Square className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onClose}
          className="flex h-10 w-12 items-center justify-center text-slate-400 transition-colors hover:bg-rose-600 hover:text-white"
          title="Hide to tray"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
