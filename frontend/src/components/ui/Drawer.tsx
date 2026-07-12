import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Drawer — the Ink & Bone slide-in right panel used for detail / create / upload
 * flows. Scrim + slide animation, Escape-to-close, click-outside-to-close, body
 * scroll lock, and a simple focus trap (Tab cycles within the panel).
 *
 * Usage:
 *   <Drawer open={open} onClose={close} title="Senior Salesforce Developer"
 *           eyebrow="JOB-000001" footer={<Button…/>}>
 *     …scrollable body…
 *   </Drawer>
 *
 * Body content is wrapped in a `.sect-scope` so <Section> numbering restarts.
 */
export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Large serif title in the sticky header. */
  title?: ReactNode;
  /** Small mono line above the title (e.g. an id). */
  eyebrow?: ReactNode;
  /** Extra header content (right of the title, before the close button). */
  headerExtra?: ReactNode;
  /** Sticky footer (action buttons etc.). */
  footer?: ReactNode;
  children: ReactNode;
  /** Override the panel width (default min(800px, 100%)). */
  width?: number | string;
  /** Accessible label when no textual title is provided. */
  ariaLabel?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  headerExtra,
  footer,
  children,
  width,
  ariaLabel,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    // Move focus into the panel.
    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (nodes.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = '';
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="scrim" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === 'string' ? title : 'Panel')}
        tabIndex={-1}
        style={width ? { width } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <div className="min-w-0">
            {eyebrow && (
              <div className="ib-mono" style={{ fontSize: 9.5, letterSpacing: '0.14em', color: 'var(--dim)', textTransform: 'uppercase' }}>
                {eyebrow}
              </div>
            )}
            {title && <h2>{title}</h2>}
          </div>
          <div className="flex items-center gap-2">
            {headerExtra}
            <button className="drawer-x" onClick={onClose} aria-label="Close panel">
              ✕
            </button>
          </div>
        </div>
        <div className="drawer-body">
          <div className="sect-scope">{children}</div>
        </div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
