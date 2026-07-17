import { useEffect, useRef, useState } from "react";
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
import { useMediaQuery } from "./lib/useMediaQuery";
import { useEditor } from "./stores/editorStore";

type MobileTab = "tools" | "colour" | "export" | "info";

const TABS: { id: MobileTab; label: string }[] = [
  { id: "tools", label: "Tools" },
  { id: "colour", label: "Colour" },
  { id: "export", label: "Export" },
  { id: "info", label: "Info" },
];

/** The two desktop rails, stacked into one scrolling column and reached through the
 *  bottom tab bar. Each panel still mounts once — this branch or the desktop one runs,
 *  never both — so palette extraction and format detection don't double-fire. */
function MobileSheet({ tab }: { tab: MobileTab }) {
  return (
    <div className="flex flex-col gap-4">
      {tab === "tools" && (
        <>
          <ToolRail />
          <OpControls />
          <StackPanel />
        </>
      )}
      {tab === "colour" && (
        <>
          <ColorPanel />
          <PalettePanel />
        </>
      )}
      {tab === "export" && (
        <>
          <ExportBar />
          <BatchPanel />
        </>
      )}
      {tab === "info" && <MetaPanel />}
    </div>
  );
}

const HINT_SEEN_KEY = "imagelab.handoffHintSeen";

function hintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_SEEN_KEY) === "1";
  } catch {
    return true; // No storage (private mode) → don't nag on every handoff.
  }
}
function markHintSeen() {
  try {
    localStorage.setItem(HINT_SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

function MobileWorkspace() {
  const [tab, setTab] = useState<MobileTab | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const startPos = useRef<number | null>(null);
  const label = TABS.find((t) => t.id === tab)?.label;

  // In short landscape the bottom sheet would leave almost no canvas, so it comes in
  // from the right instead — the one axis a landscape phone has to spare.
  const side = useMediaQuery("(orientation: landscape) and (max-height: 600px)");

  // Tools that finish on the canvas — a colour pick armed, or a crop/redact box to
  // drag — need the image, not a panel. Hand off: drop the sheet the moment one arms
  // so the canvas is reachable, and let the tab bar bring the panel back.
  const pickTarget = useEditor((s) => s.pickTarget);
  const ops = useEditor((s) => s.ops);
  const activeOpId = useEditor((s) => s.activeOpId);
  const activeType = ops.find((o) => o.id === activeOpId)?.type;
  const canvasTool = activeType === "crop" || activeType === "redact";
  const handoff = Boolean(pickTarget) || canvasTool;

  const hintText = pickTarget
    ? "Tap the image to pick the colour"
    : activeType === "crop"
      ? "Drag a box on the image to crop"
      : activeType === "redact"
        ? "Drag over the parts to hide"
        : "";

  useEffect(() => {
    if (pickTarget) setTab(null);
  }, [pickTarget]);
  useEffect(() => {
    if (canvasTool) setTab(null);
  }, [canvasTool]);

  // First time a tool hands off to the canvas, explain why the panel stepped aside.
  // Once only — the viewport's status bar carries the reminder after that.
  useEffect(() => {
    if (!handoff || hintSeen()) return;
    markHintSeen();
    setShowHint(true);
    const t = setTimeout(() => setShowHint(false), 5000);
    return () => clearTimeout(t);
  }, [handoff]);

  // A fresh sheet always opens seated, never mid-drag; ditto if the axis flips.
  useEffect(() => {
    setDrag(0);
    setDragging(false);
  }, [tab, side]);

  function onGrabDown(e: React.PointerEvent) {
    startPos.current = side ? e.clientX : e.clientY;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onGrabMove(e: React.PointerEvent) {
    if (startPos.current === null) return;
    const delta = (side ? e.clientX : e.clientY) - startPos.current;
    setDrag(Math.max(0, delta)); // Only dismiss-ward: down for bottom, right for side.
  }
  function onGrabUp() {
    if (drag > 72) setTab(null);
    startPos.current = null;
    setDragging(false);
    setDrag(0);
  }

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      {/* The canvas keeps the full frame; the sheet slides over one edge so a strip of
          the image stays visible behind an open panel. */}
      <div className="relative flex flex-1 overflow-hidden">
        <Viewport />

        {showHint && hintText && (
          <div className="rise pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-4">
            <span className="tile-accent flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] shadow-lg">
              <span className="display">{hintText}</span>
            </span>
          </div>
        )}

        {tab && (
          <div
            className={
              side
                ? "sheet-right absolute inset-y-0 right-0 z-20 flex w-[min(80vw,22rem)] flex-col overflow-y-auto overscroll-contain rounded-l-xl border-l border-border bg-bg/95 backdrop-blur"
                : "sheet-up absolute inset-x-0 bottom-0 z-20 flex max-h-[74%] flex-col overflow-y-auto overscroll-contain rounded-t-xl border-t border-border bg-bg/95 backdrop-blur"
            }
            style={{
              transform: drag
                ? side
                  ? `translateX(${drag}px)`
                  : `translateY(${drag}px)`
                : undefined,
              transition: dragging ? "none" : "transform 180ms ease",
            }}
          >
            {/* Sticky grab bar: the drag zone stays put while the panel scrolls under it,
                and swiping it toward its edge dismisses the sheet. */}
            <div
              className="sticky top-0 z-10 shrink-0 cursor-grab touch-none bg-bg/95 px-3 pb-2 pt-2 backdrop-blur active:cursor-grabbing"
              onPointerDown={onGrabDown}
              onPointerMove={onGrabMove}
              onPointerUp={onGrabUp}
              onPointerCancel={onGrabUp}
            >
              {!side && <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />}
              <div className="flex items-center justify-between">
                <span className="stamp">{label}</span>
                <button type="button" className="btn btn-sm" onClick={() => setTab(null)}>
                  Close
                </button>
              </div>
            </div>
            <div className="px-3 pb-4 pt-1">
              <MobileSheet tab={tab} />
            </div>
          </div>
        )}
      </div>

      <nav
        className="grid shrink-0 grid-cols-4 border-t border-border bg-surface/40"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab((cur) => (cur === t.id ? null : t.id))}
            className={`display flex items-center justify-center text-xs transition-colors ${
              side ? "min-h-[2.75rem]" : "min-h-[3.25rem]"
            } ${tab === t.id ? "bg-surface/80 text-accent" : "text-text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </main>
  );
}

export default function App() {
  const source = useEditor((s) => s.source);
  const reset = useEditor((s) => s.reset);
  // Height matters as much as width: a phone in landscape is often ≥768px wide but only
  // ~390px tall, where the two stacked desktop rails have nowhere to go. Gate on both.
  const isDesktop = useMediaQuery("(min-width: 768px) and (min-height: 600px)");

  return (
    <div className="page flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
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
          <button type="button" className="btn btn-sm shrink-0" onClick={reset}>
            New image
          </button>
        )}
      </header>

      {source ? (
        isDesktop ? (
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
          <MobileWorkspace />
        )
      ) : (
        <Dropzone />
      )}
    </div>
  );
}
