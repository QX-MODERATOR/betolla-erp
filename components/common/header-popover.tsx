"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";

// A dropdown panel for header buttons. The header uses backdrop-blur, which makes it the containing
// block for position:fixed children, so panels rendered inside it get clipped or mis-sized on
// phones. This renders into <body> instead, anchored under its button:
//   * phones (< 640px): full width with a 12px margin, below the header;
//   * larger screens: `width` wide, aligned to the button's start edge, kept inside the viewport.
// Height is capped to the space left on screen and the panel scrolls inside itself.
interface Props {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  dir: "rtl" | "ltr";
  width?: number;
  label: string;
  className?: string;
  children: ReactNode;
}

const MARGIN = 12;

export function HeaderPopover({ anchorRef, open, onClose, dir, width = 360, label, className = "", children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties | null>(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const top = Math.round(rect.bottom + 8);
    const maxHeight = Math.max(160, vh - top - MARGIN);
    if (vw < 640) {
      setStyle({ position: "fixed", top, left: MARGIN, right: MARGIN, maxHeight });
      return;
    }
    const w = Math.min(width, vw - MARGIN * 2);
    // RTL: the panel's right edge follows the button's right edge; LTR: left follows left.
    let left = dir === "rtl" ? rect.right - w : rect.left;
    left = Math.min(Math.max(left, MARGIN), vw - w - MARGIN);
    setStyle({ position: "fixed", top, left, width: w, maxHeight });
  }, [anchorRef, dir, width]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !style || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      dir={dir}
      style={style}
      className={`z-[60] overflow-y-auto overscroll-contain rounded-2xl shadow-2xl ${className}`}
    >
      {children}
    </div>,
    document.body
  );
}
