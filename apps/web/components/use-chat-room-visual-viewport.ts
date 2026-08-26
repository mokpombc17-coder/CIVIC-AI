"use client";

import { useEffect, useRef, type RefObject } from "react";
import { calculateChatRoomVisualViewportLayout } from "@/components/chat-room-visual-viewport";

export function useChatRoomVisualViewportHeight<TElement extends HTMLElement = HTMLElement>(
  bottomGap: number,
): RefObject<TElement | null> {
  const elementRef = useRef<TElement>(null);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    let frame: number | null = null;

    const updateMaxHeight = () => {
      frame = null;
      const element = elementRef.current;

      if (!element) {
        return;
      }

      const layout = calculateChatRoomVisualViewportLayout({
        bottomGap,
        layoutViewportHeight: window.innerHeight,
        viewportHeight: visualViewport?.height ?? window.innerHeight,
        viewportOffsetTop: visualViewport?.offsetTop ?? 0,
      });
      element.style.alignSelf = layout.alignSelf;
      element.style.height = `${layout.height}px`;
      element.style.marginTop = layout.marginTop;
    };

    const scheduleMaxHeightUpdate = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }

      const element = elementRef.current;

      if (element) {
        element.style.alignSelf = "";
        element.style.height = "";
        element.style.marginTop = "";
      }

      frame = requestAnimationFrame(updateMaxHeight);
    };

    scheduleMaxHeightUpdate();
    window.addEventListener("resize", scheduleMaxHeightUpdate);
    visualViewport?.addEventListener("resize", scheduleMaxHeightUpdate);

    return () => {
      window.removeEventListener("resize", scheduleMaxHeightUpdate);
      visualViewport?.removeEventListener("resize", scheduleMaxHeightUpdate);

      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, [bottomGap]);

  return elementRef;
}
