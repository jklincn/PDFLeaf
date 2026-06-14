import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

import appIconUrl from "../../src-tauri/icons/icon.png";

const appWindow = getCurrentWindow();

function runWindowAction(action: () => Promise<void>) {
  void action().catch((error) => {
    console.error("Window action failed", error);
  });
}

export function AppTopbar() {
  return (
    <section className="app-topbar" aria-label="App toolbar">
      <div
        className="app-titlebar-drag-region"
        onMouseDown={(event) => {
          if (event.button !== 0) {
            return;
          }

          if (event.detail >= 2) {
            event.preventDefault();
            runWindowAction(() => appWindow.toggleMaximize());
            return;
          }

          runWindowAction(() => appWindow.startDragging());
        }}
      >
        <div className="app-brand">
          <img src={appIconUrl} alt="" aria-hidden="true" />
          <strong>PDFLeaf</strong>
        </div>
      </div>

      <div className="window-controls" aria-label="Window controls">
        <button
          type="button"
          className="window-control-button"
          aria-label="Minimize"
          onClick={() => runWindowAction(() => appWindow.minimize())}
        >
          <Minus aria-hidden="true" />
        </button>
        <button
          type="button"
          className="window-control-button"
          aria-label="Maximize or restore"
          onClick={() => runWindowAction(() => appWindow.toggleMaximize())}
        >
          <Square aria-hidden="true" />
        </button>
        <button
          type="button"
          className="window-control-button window-control-close"
          aria-label="Close"
          onClick={() => runWindowAction(() => appWindow.close())}
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
