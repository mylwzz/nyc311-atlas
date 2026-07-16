"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import styles from "./InfoMarker.module.css";

const VIEWPORT_GUTTER = 8;
const POPOVER_GAP = 7;

export interface InfoMarkerProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly onReadMethod?: () => void;
  readonly align?: "start" | "center" | "end";
  readonly className?: string;
}

interface PopoverPosition {
  left: number;
  top: number;
}

function isWithin(node: Node | null, container: HTMLElement | null): boolean {
  return Boolean(node && container?.contains(node));
}

export function InfoMarker({
  label,
  children,
  onReadMethod,
  align = "center",
  className,
}: InfoMarkerProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  const placePopover = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;

    const anchor = trigger.getBoundingClientRect();
    const bubble = popover.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    let left = anchor.left + anchor.width / 2 - bubble.width / 2;
    if (align === "start") left = anchor.left;
    if (align === "end") left = anchor.right - bubble.width;
    left = Math.max(
      VIEWPORT_GUTTER,
      Math.min(left, viewportWidth - bubble.width - VIEWPORT_GUTTER),
    );

    const below = anchor.bottom + POPOVER_GAP;
    const above = anchor.top - bubble.height - POPOVER_GAP;
    let top = below;
    if (below + bubble.height > viewportHeight - VIEWPORT_GUTTER && above >= VIEWPORT_GUTTER) {
      top = above;
    }
    top = Math.max(
      VIEWPORT_GUTTER,
      Math.min(top, viewportHeight - bubble.height - VIEWPORT_GUTTER),
    );
    setPosition({ left, top });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    placePopover();
  }, [children, open, placePopover]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        !isWithin(target, triggerRef.current) &&
        !isWithin(target, popoverRef.current)
      ) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close(true);
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null;
      if (
        !isWithin(target, triggerRef.current) &&
        !isWithin(target, popoverRef.current)
      ) {
        close();
      }
    };
    const onScroll = () => placePopover();
    const onResize = () => placePopover();

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [close, open, placePopover]);

  return (
    <span className={[styles.root, className].filter(Boolean).join(" ")}>
      <button
        ref={triggerRef}
        className={styles.trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setPosition(null);
          setOpen((current) => !current);
        }}
      >
        <span className={styles.glyph} aria-hidden="true">
          <svg className={styles.glyphSvg} viewBox="0 0 18 18">
            <polygon
              className={styles.plate}
              points="5,1.6 13,1.6 17,9 13,16.4 5,16.4 1,9"
              transform="rotate(30 9 9)"
            />
          </svg>
          <span className={styles.mark}>i</span>
        </span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              id={id}
              className={styles.popover}
              role="dialog"
              aria-label={label}
              style={position
                ? { left: position.left, top: position.top }
                : { left: 0, top: 0, visibility: "hidden" }}
            >
              <div className={styles.content}>{children}</div>
              {onReadMethod ? (
                <button
                  className={styles.method}
                  type="button"
                  onClick={() => {
                    close();
                    onReadMethod();
                  }}
                >
                  Read the method
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
