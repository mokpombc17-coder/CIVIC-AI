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

    if (!visualViewport) {
      return;
    }

    let frame: number | null = null;
    let viewportBaselineHeight = Math.max(window.innerHeight, visualViewport.height);

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

      const activeElement = document.activeElement;
      const hasFocusedTextEntry =
        element.contains(activeElement) && isTextEntryElement(activeElement);

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
        !shouldConstrainChatRoomToVisualViewport({
          hasFocusedTextEntry,
          viewportBaselineHeight,
          viewportHeight: visualViewport.height,
        })
      ) {
        clearViewportLayout();
        return;
      }

      const layout = calculateChatRoomVisualViewportLayout({
        bottomGap,
        viewportBaselineHeight,
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

      frame = requestAnimationFrame(updateViewportLayout);
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
