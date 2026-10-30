"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import styles from "./survey.module.css";

export type SurveyOptionLabelMode = "ordinal" | "plain";
export type SurveyDropdownPlacement = "top" | "bottom";

export function useSurveyDropdown(isOpen: boolean, onClose: () => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<SurveyDropdownPlacement>("bottom");

  const closeWhenFocusLeaves = useCallback(() => {
    requestAnimationFrame(() => {
      if (!rootRef.current?.contains(document.activeElement)) onClose();
    });
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) onClose();
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isOpen, onClose]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    function updatePlacement() {
      const root = rootRef.current;
      const menu = menuRef.current;
      if (!root || !menu) return;
      const rootRect = root.getBoundingClientRect();
      const scroller = menu.querySelector<HTMLElement>('[data-survey-menu-scroller="true"]');
      const menuHeight = Math.min(scroller?.scrollHeight ?? menu.scrollHeight, 320);
      const flowViewport = root.closest<HTMLElement>('[data-survey-flow-viewport="true"]');
      const flowViewportRect = flowViewport?.getBoundingClientRect();
      const visibleTop = Math.max(16, flowViewportRect?.top ?? 16);
      const visibleBottom = Math.min(
        window.innerHeight - 16,
        flowViewportRect?.bottom ?? window.innerHeight - 16,
      );
      const spaceBelow = Math.max(0, visibleBottom - rootRect.bottom - 8);
      const spaceAbove = Math.max(0, rootRect.top - visibleTop - 8);
      const nextPlacement = spaceBelow < menuHeight && spaceAbove > spaceBelow ? "top" : "bottom";
      const availableHeight = nextPlacement === "top" ? spaceAbove : spaceBelow;
      menu.style.setProperty(
        "--survey-select-menu-max-height",
        `${Math.max(48, Math.min(320, Math.floor(availableHeight)))}px`,
      );
      setPlacement(nextPlacement);
    }
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [isOpen]);

  return { closeWhenFocusLeaves, menuRef, placement, rootRef };
}

export const SurveyDropdownSurface = forwardRef<
  HTMLDivElement,
  {
    children: ReactNode;
    className?: string | undefined;
    id: string;
    isOpen: boolean;
    placement: SurveyDropdownPlacement;
    role?: "group" | "listbox" | undefined;
  }
>(function SurveyDropdownSurface({ children, className, id, isOpen, placement, role }, ref) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hasMoreAbove, setHasMoreAbove] = useState(false);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

  const updateScrollHints = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    setHasMoreAbove(scroller.scrollTop > 1);
    setHasMoreBelow(scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(updateScrollHints);
    const scroller = scrollerRef.current;
    const resizeObserver =
      scroller && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateScrollHints)
        : null;
    if (scroller) resizeObserver?.observe(scroller);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
    };
  }, [isOpen, updateScrollHints]);

  function scrollByPage(direction: 1 | -1) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollBy({
      behavior: reduceMotion ? "auto" : "smooth",
      top: direction * Math.max(80, scroller.clientHeight * 0.72),
    });
  }

  return (
    <div
      aria-hidden={isOpen ? undefined : true}
      className={[styles.selectMenu, className].filter(Boolean).join(" ")}
      data-open={isOpen ? "true" : "false"}
      data-placement={placement}
      inert={!isOpen}
      ref={ref}
    >
      <div
        className={styles.selectMenuScroller}
        data-survey-menu-scroller="true"
        id={id}
        onScroll={updateScrollHints}
        ref={scrollerRef}
        role={role}
      >
        {children}
      </div>
      <button
        aria-label="위의 선택지 더 보기"
        className={`${styles.selectScrollHint} ${styles.selectScrollHintTop}`}
        data-visible={isOpen && hasMoreAbove ? "true" : "false"}
        onClick={() => scrollByPage(-1)}
        onMouseDown={(event) => event.preventDefault()}
        tabIndex={-1}
        type="button"
      >
        <span aria-hidden="true" />
      </button>
      <button
        aria-label="아래의 선택지 더 보기"
        className={`${styles.selectScrollHint} ${styles.selectScrollHintBottom}`}
        data-visible={isOpen && hasMoreBelow ? "true" : "false"}
        onClick={() => scrollByPage(1)}
        onMouseDown={(event) => event.preventDefault()}
        tabIndex={-1}
        type="button"
      >
        <span aria-hidden="true" />
      </button>
    </div>
  );
});

export function SurveyOptionContent({
  index,
  label,
  labelMode,
  selected = false,
}: {
  index: number;
  label: string;
  labelMode: SurveyOptionLabelMode;
  selected?: boolean;
}) {
  return (
    <>
      <span className={styles.selectOptionMain}>
        {labelMode === "ordinal" ? (
          <span aria-hidden="true" className={styles.selectOptionOrdinal}>
            {index + 1})
          </span>
        ) : null}
        <span className={styles.selectOptionText}>{label}</span>
      </span>
      {selected ? <span aria-hidden="true" className={styles.selectOptionCheck} /> : null}
    </>
  );
}
