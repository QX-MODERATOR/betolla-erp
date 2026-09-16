"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Native modal semantics, focus containment, Escape and focus restoration. */
export function Modal({ children, label, onClose, busy = false }: {
  children: ReactNode; label: string; onClose: () => void; busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return <dialog ref={ref} aria-label={label} aria-busy={busy}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    className="ui-dialog fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-xl border-0 bg-transparent p-0 backdrop:bg-black/50 backdrop:backdrop-blur-sm">
    {children}
  </dialog>;
}
