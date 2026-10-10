"use client";

import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** A clickable card face that opens its details (and the treasurer's controls) in a modal. */
export function CardDialog({ trigger, title, label, children }: { trigger: ReactNode; title: ReactNode; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => ref.current?.showModal()}
        className="block w-full rounded-[18px] text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint"
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        // Clicking the backdrop (the dialog element itself, outside the panel) closes it.
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="sheet rounded-2xl border border-line bg-surface p-0 text-ink shadow-[var(--shadow-lift)]"
      >
        <div className="max-h-[85vh] overflow-y-auto p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 className="display text-2xl leading-tight">{title}</h2>
            <button type="button" onClick={() => ref.current?.close()} className="-mr-2 -mt-1 rounded-full p-2 text-ink-3 hover:bg-paper-2 hover:text-ink" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
