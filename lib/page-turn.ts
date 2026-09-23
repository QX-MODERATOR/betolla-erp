// The 3D page turn between the driver's list and one delivery (/driver/delivery/[id]).
//
// It is the browser's View Transition on the whole screen: the current screen is snapshotted, the
// navigation runs, and once the new page has its data the two snapshots turn like the pages of a
// book (globals.css, :active-view-transition-type(vt-forward | vt-back)).
//
// Not React's <ViewTransition>: that snapshots each page element separately, and in this RTL layout
// Chromium places those per-element snapshots a full page-width off screen, so the turn showed an
// empty page. The whole-screen snapshot has no such problem.
//
// Browsers without View Transitions (older Android WebViews), and anyone who asked for reduced
// motion, simply navigate.
type Starter = (options: { update: () => Promise<void>; types: string[] }) => unknown;

export function turnPage(go: () => void, isReady: () => boolean, direction: "forward" | "back") {
  const start = (document as unknown as { startViewTransition?: Starter }).startViewTransition;
  if (!start || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { go(); return; }
  try {
    const transition = start.call(document, {
      types: [direction === "forward" ? "vt-forward" : "vt-back"],
      // The old screen stays frozen until the new page is ready (at most 1.5s), so the turn lands on
      // real content rather than a loading spinner.
      update: async () => {
        go();
        const since = Date.now();
        // A timer, not requestAnimationFrame: frames are paused while the old screen is frozen.
        while (!isReady() && Date.now() - since < 1500) await new Promise((r) => setTimeout(r, 40));
      },
    }) as { ready?: Promise<unknown>; finished?: Promise<unknown>; updateCallbackDone?: Promise<unknown> } | undefined;
    // A turn the browser gives up on (a very slow page) just ends; the navigation has already run.
    for (const p of [transition?.ready, transition?.finished, transition?.updateCallbackDone]) p?.catch(() => {});
  } catch {
    go(); // an engine with the older callback-only API
  }
}

/** True once the page marked `data-page={name}` has finished loading (`data-ready`). */
export const pageReady = (name: string) => () => !!document.querySelector(`[data-page="${name}"][data-ready]`);
