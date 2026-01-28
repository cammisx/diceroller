import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Drawer (bottom sheet)
 * - fecha no ESC
 * - fecha ao clicar no backdrop
 */
export default function Drawer({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKeyDown);

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="ui-drawer-backdrop" onMouseDown={onClose} role="presentation">
      <div
        className="ui-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title || "Drawer"}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ui-drawer-handle" aria-hidden="true" />
        <div className="ui-drawer-header">
          <div className="ui-drawer-title">{title}</div>
          <button type="button" className="ui-modal-close" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="ui-drawer-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
