import { useEffect, useState, type MouseEvent } from 'react';
import {
  PhysicalPosition,
  PhysicalSize,
  currentMonitor,
  getCurrentWindow,
} from '@tauri-apps/api/window';
import './WindowControls.css';

const HALF_WINDOW_RATIO = 0.5;

function getAppWindow() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

const appWindow = getAppWindow();

function waitForWindowModeChange() {
  return new Promise((resolve) => window.setTimeout(resolve, 80));
}

async function getNativeHalfSizeState(fallback: boolean) {
  if (!appWindow) return fallback;
  try {
    return !(await appWindow.isFullscreen());
  } catch {
    return fallback;
  }
}

async function minimizeWindow() {
  if (!appWindow) return;
  try {
    await appWindow.minimize();
  } catch (error) {
    console.error('Failed to minimize window', error);
  }
}

async function closeWindow() {
  if (!appWindow) {
    window.close();
    return;
  }
  try {
    await appWindow.close();
  } catch (error) {
    console.error('Failed to close Tauri window', error);
    window.close();
  }
}

export default function WindowControls() {
  const [isHalfSize, setIsHalfSize] = useState(false);

  useEffect(() => {
    getNativeHalfSizeState(false).then(setIsHalfSize);
  }, []);

  async function toggleHalfSizeWindow() {
    if (!appWindow) {
      setIsHalfSize((value) => !value);
      return;
    }

    try {
      const nativeHalfSize = await getNativeHalfSizeState(isHalfSize);

      if (nativeHalfSize) {
        await appWindow.setFullscreen(true);
        await waitForWindowModeChange();
        setIsHalfSize(false);
        return;
      }

      const monitor = await currentMonitor();
      const size = monitor?.workArea.size ?? monitor?.size;
      const position = monitor?.workArea.position ?? monitor?.position;
      const screen = window.screen as Screen & { availLeft?: number; availTop?: number };
      const fallbackWidth = screen?.availWidth || window.innerWidth || 1280;
      const fallbackHeight = screen?.availHeight || window.innerHeight || 720;
      const fallbackLeft = screen?.availLeft || 0;
      const fallbackTop = screen?.availTop || 0;
      const monitorWidth = size?.width ?? fallbackWidth;
      const monitorHeight = size?.height ?? fallbackHeight;
      const monitorLeft = position?.x ?? fallbackLeft;
      const monitorTop = position?.y ?? fallbackTop;
      const nextWidth = Math.round(monitorWidth * HALF_WINDOW_RATIO);
      const nextHeight = Math.round(monitorHeight * HALF_WINDOW_RATIO);
      const nextLeft = Math.round(monitorLeft + (monitorWidth - nextWidth) / 2);
      const nextTop = Math.round(monitorTop + (monitorHeight - nextHeight) / 2);

      await appWindow.setFullscreen(false);
      await waitForWindowModeChange();
      await appWindow.setSize(new PhysicalSize(nextWidth, nextHeight));
      await appWindow.setPosition(new PhysicalPosition(nextLeft, nextTop));
      setIsHalfSize(true);
    } catch (error) {
      console.error('Failed to toggle half-size window', error);
    }
  }

  async function startWindowDrag(event: MouseEvent<HTMLDivElement>) {
    if (!isHalfSize || event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }

    try {
      if (!appWindow) return;
      await appWindow.startDragging();
    } catch (error) {
      console.error('Failed to start window dragging', error);
    }
  }

  return (
    <div className="window-control-zone" data-window-mode={isHalfSize ? 'half' : 'fullscreen'}>
      <div
        className="window-control-bar"
        role="toolbar"
        aria-label="Window controls"
        onMouseDown={startWindowDrag}
      >
        <div className="window-control-drag-hint" aria-hidden="true" />
        <button
          type="button"
          className="window-control-btn"
          aria-label="Minimize window"
          title="Minimize"
          onClick={minimizeWindow}
        >
          -
        </button>
        <button
          type="button"
          className="window-control-btn window-control-half"
          aria-label={isHalfSize ? 'Return to fullscreen' : 'Set window to half size'}
          title={isHalfSize ? 'Fullscreen' : 'Half size'}
          onClick={toggleHalfSizeWindow}
        />
        <button
          type="button"
          className="window-control-btn window-control-close"
          aria-label="Close window"
          title="Close"
          onClick={closeWindow}
        >
          x
        </button>
      </div>
    </div>
  );
}
