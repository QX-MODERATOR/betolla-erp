"use client";

import { useEffect } from "react";

// Keyboard and screen-reader behaviour for every modal in the app. A modal marks its full-screen
// overlay with `data-dialog`; its first child is the dialog panel. While it is open:
//   * the panel is announced as a modal dialog, named by its first heading;
//   * focus moves into it, Tab stays inside it, and focus returns afterwards;
//   * Escape closes it — through a button marked `data-dialog-close` or labelled "إغلاق"/"Close",
//     an X-icon button, or a button reading إغلاق/إلغاء/✕/×, otherwise by clicking the overlay.
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface Open { overlay: HTMLElement; panel: HTMLElement; restore: HTMLElement | null }

let counter = 0;

function panelOf(overlay: HTMLElement): HTMLElement {
  if (overlay.getAttribute("role") === "dialog") return overlay;
  const first = overlay.firstElementChild;
  return first instanceof HTMLElement ? first : overlay;
}

function visibleFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function DialogA11y() {
  useEffect(() => {
    const open: Open[] = [];

    const enter = (overlay: HTMLElement) => {
      if (open.some((o) => o.overlay === overlay)) return;
      const panel = panelOf(overlay);
      if (!panel.hasAttribute("role")) panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      if (!panel.hasAttribute("aria-label") && !panel.hasAttribute("aria-labelledby")) {
        const heading = panel.querySelector("h1,h2,h3,h4");
        if (heading) {
          if (!heading.id) heading.id = `dialog-title-${++counter}`;
          panel.setAttribute("aria-labelledby", heading.id);
        }
      }
      if (!panel.hasAttribute("tabindex")) panel.tabIndex = -1;
      const active = document.activeElement;
      open.push({ overlay, panel, restore: active instanceof HTMLElement ? active : null });
      // Focus the panel itself (not the first field), so phones don't pop the keyboard open.
      if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    };

    const sync = () => {
      for (let i = open.length - 1; i >= 0; i--) {
        if (!open[i].overlay.isConnected) {
          const [gone] = open.splice(i, 1);
          if (i === open.length && gone.restore?.isConnected) gone.restore.focus({ preventScroll: true });
        }
      }
      document.querySelectorAll<HTMLElement>("[data-dialog]").forEach(enter);
    };

    const onKey = (e: KeyboardEvent) => {
      const top = open[open.length - 1];
      if (!top || !top.overlay.isConnected) return;
      if (e.key === "Escape") {
        e.preventDefault();
        const buttons = Array.from(top.panel.querySelectorAll<HTMLElement>("button"));
        const closer = top.panel.querySelector<HTMLElement>('[data-dialog-close],button[aria-label="إغلاق"],button[aria-label="Close"]')
          ?? buttons.find((b) => Array.from(b.children).some((c) => c.tagName.toLowerCase() === "svg" && c.classList.contains("lucide-x")))
          ?? buttons.find((b) => ["إغلاق", "إلغاء", "Close", "Cancel", "✕", "×"].includes((b.textContent || "").trim()));
        if (closer) closer.click();
        else top.overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return;
      }
      if (e.key !== "Tab") return;
      const items = visibleFocusables(top.panel);
      if (!items.length) { e.preventDefault(); top.panel.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      const inside = top.panel.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", onKey);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}
