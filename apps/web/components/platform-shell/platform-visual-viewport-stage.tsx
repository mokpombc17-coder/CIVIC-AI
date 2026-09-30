"use client";

import { useEffect, useRef, type ReactNode } from "react";

const TEXT_INPUT_TYPES = new Set(["email", "number", "password", "search", "tel", "text", "url"]);

type NavigatorWithStandalone = Navigator & Readonly<{ standalone?: boolean }>;

export function PlatformVisualViewportStage({
  children,
  className,
}: Readonly<{ children: ReactNode; className: string | undefined }>) {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const viewport = window.visualViewport;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as NavigatorWithStandalone).standalone === true;

    if (!stage || !viewport || !standalone) return;

    const activeStage = stage;
    const activeViewport = viewport;
    let animationFrame = 0;

    function syncViewportHeight() {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        if (!isTextEditingElement(document.activeElement)) {
          activeStage.style.removeProperty("--platform-visual-viewport-height");
          delete activeStage.dataset.visualViewport;
          return;
        }

        activeStage.style.setProperty(
          "--platform-visual-viewport-height",
          `${activeViewport.height}px`,
        );
        activeStage.dataset.visualViewport = "true";
      });
    }

    activeViewport.addEventListener("resize", syncViewportHeight);
    document.addEventListener("focusin", syncViewportHeight);
    document.addEventListener("focusout", syncViewportHeight);
    syncViewportHeight();

    return () => {
      cancelAnimationFrame(animationFrame);
      activeViewport.removeEventListener("resize", syncViewportHeight);
      document.removeEventListener("focusin", syncViewportHeight);
      document.removeEventListener("focusout", syncViewportHeight);
      activeStage.style.removeProperty("--platform-visual-viewport-height");
      delete activeStage.dataset.visualViewport;
    };
  }, []);

  return (
    <div
      className={className}
      data-platform-shell-stage="true"
      data-visual-viewport-sizing="true"
      ref={stageRef}
    >
      {children}
    </div>
  );
}

function isTextEditingElement(element: Element | null): boolean {
  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }

  if (element instanceof HTMLInputElement) {
    return !element.disabled && !element.readOnly && TEXT_INPUT_TYPES.has(element.type);
  }

  return element instanceof HTMLElement && element.isContentEditable;
}
