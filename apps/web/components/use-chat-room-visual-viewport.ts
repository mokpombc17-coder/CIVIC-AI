"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  calculateChatRoomVisualViewportLayout,
  shouldConstrainChatRoomToVisualViewport,
} from "@/components/chat-room-visual-viewport";

export function useChatRoomVisualViewportHeight<TElement extends HTMLElement = HTMLElement>(
  bottomGap: number,
): RefObject<TElement | null> {
  const elementRef = useRef<TElement>(null);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    let frame: number | null = null;

    const clearViewportLayout = () => {
      const element = elementRef.current;

      if (!element) {
        return;
      }

      element.style.alignSelf = "";
      element.style.height = "";
      element.style.marginTop = "";
    };

    const updateViewportLayout = () => {
      frame = null;
      const element = elementRef.current;

      if (!element) {
        return;
      }

      if (
        !visualViewport ||
        !shouldConstrainChatRoomToVisualViewport({
          hasFocusedTextEntry: isTextEntryElement(document.activeElement),
          layoutViewportHeight: window.innerHeight,
          viewportHeight: visualViewport.height,
          viewportOffsetTop: visualViewport.offsetTop,
        })
      ) {
        clearViewportLayout();
        return;
      }

      const layout = calculateChatRoomVisualViewportLayout({
        bottomGap,
        layoutViewportHeight: window.innerHeight,
        viewportHeight: visualViewport.height,
        viewportOffsetTop: visualViewport.offsetTop,
      });
      element.style.alignSelf = layout.alignSelf;
      element.style.height = `${layout.height}px`;
      element.style.marginTop = layout.marginTop;
    };

    const scheduleViewportLayoutUpdate = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }

      clearViewportLayout();
      frame = requestAnimationFrame(updateViewportLayout);
    };

    scheduleViewportLayoutUpdate();
    window.addEventListener("focusin", scheduleViewportLayoutUpdate);
    window.addEventListener("focusout", scheduleViewportLayoutUpdate);
    window.addEventListener("resize", scheduleViewportLayoutUpdate);
    visualViewport?.addEventListener("resize", scheduleViewportLayoutUpdate);
    visualViewport?.addEventListener("scroll", scheduleViewportLayoutUpdate);

    return () => {
      window.removeEventListener("focusin", scheduleViewportLayoutUpdate);
      window.removeEventListener("focusout", scheduleViewportLayoutUpdate);
      window.removeEventListener("resize", scheduleViewportLayoutUpdate);
      visualViewport?.removeEventListener("resize", scheduleViewportLayoutUpdate);
      visualViewport?.removeEventListener("scroll", scheduleViewportLayoutUpdate);

      if (frame !== null) {
        cancelAnimationFrame(frame);
      }

      clearViewportLayout();
    };
  }, [bottomGap]);

  return elementRef;
}

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

function isTextEntryElement(element: Element | null): boolean {
  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }

  if (element instanceof HTMLInputElement) {
    return !element.disabled && !element.readOnly && !NON_TEXT_INPUT_TYPES.has(element.type);
  }

  return element instanceof HTMLElement && element.isContentEditable;
}
