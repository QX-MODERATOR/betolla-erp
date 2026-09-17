"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

// The app's own confirmation and input dialogs (replace window.confirm / window.prompt, which
// can't be styled or translated and freeze the Android app's web view).
interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
interface PromptOptions extends ConfirmOptions {
  label?: string;
  placeholder?: string;
  initialValue?: string;
  required?: boolean;
}

interface Request {
  kind: "confirm" | "prompt";
  options: PromptOptions;
  resolve: (value: boolean | string | null) => void;
}

interface DialogApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useConfirm(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [value, setValue] = useState("");
  const pending = useRef<Request | null>(null);

  const finish = useCallback((result: boolean | string | null) => {
    pending.current?.resolve(result);
    pending.current = null;
    setRequest(null);
  }, []);

  const open = useCallback((kind: Request["kind"], options: PromptOptions) =>
    new Promise<boolean | string | null>((resolve) => {
      pending.current?.resolve(kind === "confirm" ? false : null);
      const next = { kind, options, resolve };
      pending.current = next;
      setValue(options.initialValue ?? "");
      setRequest(next);
    }), []);

  const api: DialogApi = {
    confirm: useCallback((options: ConfirmOptions) => open("confirm", options) as Promise<boolean>, [open]),
    prompt: useCallback((options: PromptOptions) => open("prompt", options) as Promise<string | null>, [open]),
  };

  const o = request?.options;
  const cancel = () => finish(request?.kind === "confirm" ? false : null);
  const canSubmit = request?.kind !== "prompt" || !o?.required || value.trim().length > 0;
  const submit = () => {
    if (!request || !canSubmit) return;
    finish(request.kind === "confirm" ? true : value.trim());
  };

  return (
    <DialogContext.Provider value={api}>
      {children}
      {request && o && (
        <div
          data-dialog=""
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={(e) => { if (e.target === e.currentTarget) cancel(); }}
        >
          <form
            className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl space-y-4 text-stone-900"
            onSubmit={(e) => { e.preventDefault(); submit(); }}
          >
            <h3 className="text-base font-black">{o.title}</h3>
            {o.message && <p className="whitespace-pre-line text-sm leading-relaxed text-stone-600">{o.message}</p>}
            {request.kind === "prompt" && (
              <label className="block space-y-1">
                {o.label && <span className="text-xs font-bold text-stone-700">{o.label}</span>}
                <textarea
                  rows={2}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={o.placeholder}
                  autoFocus
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-sm outline-none focus:border-amber-500"
                />
              </label>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={!canSubmit}
                className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 ${o.danger ? "bg-rose-600 hover:bg-rose-700" : "bg-stone-900 hover:bg-stone-800"}`}
              >
                {o.confirmLabel ?? "تأكيد"}
              </button>
              <button type="button" data-dialog-close onClick={cancel} className="rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-bold text-stone-700 hover:bg-stone-200">
                {o.cancelLabel ?? "إلغاء"}
              </button>
            </div>
          </form>
        </div>
      )}
    </DialogContext.Provider>
  );
}
