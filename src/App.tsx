import ColorPanel from "./components/ColorPanel";
import Dropzone from "./components/Dropzone";
import ExportBar from "./components/ExportBar";
import OpControls from "./components/OpControls";
import PalettePanel from "./components/PalettePanel";
import StackPanel from "./components/StackPanel";
import ToolRail from "./components/ToolRail";
import Viewport from "./components/Viewport";
import { useEditor } from "./stores/editorStore";

export default function App() {
  const source = useEditor((s) => s.source);
  const reset = useEditor((s) => s.reset);

  return (
    <div className="page flex h-screen flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-baseline gap-3">
          <span className="display text-sm">image lab</span>
          <a className="link text-[11px] text-text-muted" href="https://modul4r.com">
            a modul4r tool
          </a>
        </div>
        {source && (
          <button type="button" className="btn btn-sm" onClick={reset}>
            New image
          </button>
        )}
      </header>

      {source ? (
        <main className="flex flex-1 overflow-hidden">
          <aside className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border p-3">
            <ToolRail />
            <OpControls />
            <StackPanel />
          </aside>
          <Viewport />
          <aside className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-3">
            <ColorPanel />
            <PalettePanel />
            <div className="mt-auto">
              <ExportBar />
            </div>
          </aside>
        </main>
      ) : (
        <Dropzone />
      )}
    </div>
  );
}
