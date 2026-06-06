import { createPortal } from "react-dom";
import type { ReactNode } from "react";

export function FormGroup({ children }: { children: ReactNode }) {
  return <div className="mb-3.5">{children}</div>;
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-[0.5px]">
      {children}
    </label>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="flex justify-between gap-2 mt-5">{children}</div>;
}

export function ModalActionsRight({ children }: { children: ReactNode }) {
  return <div className="flex gap-2 ml-auto">{children}</div>;
}

interface BaseModalProps {
  onClose: () => void;
  title: string;
  actions: ReactNode;
  children: ReactNode;
  width?: number;
}

export function BaseModal({ onClose, title, actions, children, width = 400 }: BaseModalProps) {
  return createPortal(
    <>
      <div className="fixed inset-0 z-[199] bg-black/50" onClick={onClose} />
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-xl p-6 z-[200] shadow-modal"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base mb-4 text-foreground">{title}</h3>
        {children}
        {actions}
      </div>
    </>,
    document.body,
  );
}
