import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Modal simples
 * - fecha no ESC
 * - fecha ao clicar no backdrop
 */
export default function Modal({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKeyDown);

    // trava scroll do fundo
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="ui-modal-backdrop" onMouseDown={onClose} role="presentation">
      <div
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title || "Modal"}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ui-modal-header">
          <div className="ui-modal-title">{title}</div>
          <button type="button" className="ui-modal-close" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="ui-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
