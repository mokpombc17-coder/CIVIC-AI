"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { PlatformShellProps } from "./platform-shell";
import styles from "./platform-shell.module.css";
import {
  calculatePlatformVisualViewportLayout,
  isPlatformTextEntry,
  shouldConstrainPlatformToVisualViewport,
} from "./platform-visual-viewport";

export function PlatformShellVisualViewportBoundary({
  bottomNavigation,
  children,
  className,
  contentInert = false,
  contentClassName,
  header,
  headerSize,
  overlay,
  scroll = "self",
}: PlatformShellProps) {
  const shellRef = useRef<HTMLDivElement>(null);

  usePlatformShellVisualViewport(shellRef);

  return (
    <div className={styles.stage} data-platform-shell-stage="true">
      <div
        className={joinClassNames(styles.shell, className)}
        data-header-size={headerSize}
        data-keyboard-open="false"
        data-platform-shell="true"
        data-scroll={scroll}
        ref={shellRef}
      >
        <div
          aria-hidden={contentInert ? true : undefined}
          className={styles.surface}
          data-platform-shell-surface="true"
          inert={contentInert}
        >
          {header}
          <main
            className={joinClassNames(styles.content, contentClassName)}
            data-platform-shell-content="true"
            data-scroll={scroll}
          >
            {children}
          </main>
          {bottomNavigation ? (
            <div
              className={styles.bottomNavigationSlot}
              data-platform-shell-bottom-navigation="true"
            >
              {bottomNavigation}
            </div>
          ) : null}
        </div>
        {overlay ? (
          <div className={styles.overlay} data-platform-shell-overlay="true">
            {overlay}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function usePlatformShellVisualViewport(shellRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const visualViewport = window.visualViewport;

    if (!visualViewport) {
      return;
    }

    let frame: number | null = null;
    let viewportBaselineHeight = Math.max(window.innerHeight, visualViewport.height);

    const clearViewportLayout = () => {
      const shell = shellRef.current;

      if (!shell) {
        return;
      }

      shell.dataset.keyboardOpen = "false";
      shell.style.alignSelf = "";
      shell.style.height = "";
      shell.style.marginTop = "";
    };

    const updateViewportLayout = () => {
      const shell = shellRef.current;

      if (!shell) {
        return;
      }

      const activeElement = document.activeElement;
      const hasFocusedTextEntry =
        activeElement !== null &&
        shell.contains(activeElement) &&
        isPlatformTextEntry({
          contentEditable: activeElement instanceof HTMLElement && activeElement.isContentEditable,
          disabled: "disabled" in activeElement && activeElement.disabled === true,
          inputType:
            activeElement.tagName.toLowerCase() === "input"
              ? (activeElement as HTMLInputElement).type
              : "text",
          readOnly: "readOnly" in activeElement && activeElement.readOnly === true,
          tagName: activeElement.tagName,
        });

      if (!hasFocusedTextEntry) {
        viewportBaselineHeight = Math.max(window.innerHeight, visualViewport.height);
        clearViewportLayout();
        return;
      }

      viewportBaselineHeight = Math.max(
        viewportBaselineHeight,
        window.innerHeight,
        visualViewport.height,
      );

      if (
        !shouldConstrainPlatformToVisualViewport({
          hasFocusedTextEntry,
          viewportBaselineHeight,
          viewportHeight: visualViewport.height,
        })
      ) {
        clearViewportLayout();
        return;
      }

      const layout = calculatePlatformVisualViewportLayout({
        bottomGap: 0,
        viewportBaselineHeight,
        viewportHeight: visualViewport.height,
        viewportOffsetTop: visualViewport.offsetTop,
      });

      shell.dataset.keyboardOpen = "true";
      shell.style.alignSelf = layout.alignSelf;
      shell.style.height = `${layout.height}px`;
      shell.style.marginTop = layout.marginTop;
    };

    const scheduleViewportLayoutUpdate = () => {
      if (frame !== null) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = null;
        updateViewportLayout();
      });
    };

    scheduleViewportLayoutUpdate();
    window.addEventListener("focusin", scheduleViewportLayoutUpdate);
    window.addEventListener("focusout", scheduleViewportLayoutUpdate);
    window.addEventListener("resize", scheduleViewportLayoutUpdate);
    visualViewport.addEventListener("resize", scheduleViewportLayoutUpdate);
    visualViewport.addEventListener("scroll", scheduleViewportLayoutUpdate);

    return () => {
      window.removeEventListener("focusin", scheduleViewportLayoutUpdate);
      window.removeEventListener("focusout", scheduleViewportLayoutUpdate);
      window.removeEventListener("resize", scheduleViewportLayoutUpdate);
      visualViewport.removeEventListener("resize", scheduleViewportLayoutUpdate);
      visualViewport.removeEventListener("scroll", scheduleViewportLayoutUpdate);

      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }

      clearViewportLayout();
    };
  }, [shellRef]);
}

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}
