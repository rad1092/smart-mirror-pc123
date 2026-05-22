import { type MouseEvent, useCallback } from "react";

type TauriWindow = {
  minimize: () => Promise<void>;
  close: () => Promise<void>;
  isFullscreen: () => Promise<boolean>;
  setFullscreen: (fullscreen: boolean) => Promise<void>;
  setSize?: (size: unknown) => Promise<void>;
  setPosition?: (position: unknown) => Promise<void>;
  startDragging: () => Promise<void>;
};

async function getTauriWindow(): Promise<TauriWindow> {
  const mod = (await import("@tauri-apps/api/window")) as { getCurrentWindow: () => TauriWindow };
  return mod.getCurrentWindow();
}

async function restoreWindowedSize(window: TauriWindow) {
  if (!window.setSize || !window.setPosition) {
    return;
  }
  const dpi = (await import("@tauri-apps/api/dpi")) as {
    LogicalPosition: new (x: number, y: number) => unknown;
    LogicalSize: new (width: number, height: number) => unknown;
  };
  await window.setSize(new dpi.LogicalSize(1280, 820));
  await window.setPosition(new dpi.LogicalPosition(80, 60));
}

export default function WindowControls() {
  const minimize = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void getTauriWindow().then((window) => window.minimize());
  }, []);

  const toggleWindowMode = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void getTauriWindow().then(async (window) => {
      const isFullscreen = await window.isFullscreen();
      await window.setFullscreen(!isFullscreen);
      if (isFullscreen) {
        await restoreWindowedSize(window);
      }
    });
  }, []);

  const close = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void getTauriWindow().then((window) => window.close());
  }, []);

  const drag = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }
    void getTauriWindow().then((window) => window.startDragging());
  }, []);

  return (
    <div className="window-controls" onMouseDown={drag}>
      <button type="button" aria-label="최소화" title="최소화" onMouseDown={(event) => event.stopPropagation()} onClick={minimize}>
        -
      </button>
      <button type="button" aria-label="창 모드 전환" title="창 모드 전환" onMouseDown={(event) => event.stopPropagation()} onClick={toggleWindowMode}>
        □
      </button>
      <button type="button" aria-label="닫기" title="닫기" onMouseDown={(event) => event.stopPropagation()} onClick={close}>
        x
      </button>
    </div>
  );
}
