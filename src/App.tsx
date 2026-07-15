import BatchPanel from "./components/BatchPanel";
import ColorPanel from "./components/ColorPanel";
import Dropzone from "./components/Dropzone";
import ExportBar from "./components/ExportBar";
import MetaPanel from "./components/MetaPanel";
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
          {/* AGPL-3.0 obliges us to offer the source to anyone using this over a
              network, and this is the network. */}
          <a
            className="link text-[11px] text-text-muted"
            href="https://github.com/FatherMarz/image-lab"
            target="_blank"
            rel="noreferrer"
          >
            source
          </a>
        </div>
        {source && (
          <button type="button" className="btn btn-sm" onClick={reset}>
            New image
          </button>
        )}
      </header>

      {source ? (
        // Each rail pins its fixed sections and scrolls only the variable middle, so
        // selecting a tool or picking a colour never shifts anything else.
        <main className="flex flex-1 overflow-hidden">
          {/* The tool list scrolls together with its controls: the controls change
              height per tool, and pinning the list above them starved them of room.
              Nothing below them moves because the stack is pinned. */}
          <aside className="flex w-64 shrink-0 flex-col border-r border-border">
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
              <ToolRail />
              <OpControls />
            </div>
            <div className="shrink-0 border-t border-border p-3">
              <StackPanel />
            </div>
          </aside>

          <Viewport />

          {/* One natural scroll column, ordered by the actual loop: pick a colour, pull
              a palette, export. Those three fit above the fold at laptop height. The
              passive EXIF readout and the batch workflow sit below it — reachable, and
              nothing anyone needs mid-edit. Pinning export to the bottom instead left
              the panels above it squeezed into 411px of a 586px stack, which sliced
              tiles through the middle and hid Metadata entirely. */}
          <aside className="w-64 shrink-0 overflow-y-auto border-l border-border">
            <div className="flex flex-col gap-4 p-3">
              <ColorPanel />
              <PalettePanel />
              <ExportBar />
              <MetaPanel />
              <BatchPanel />
            </div>
          </aside>
        </main>
      ) : (
        <Dropzone />
      )}
    </div>
  );
}
