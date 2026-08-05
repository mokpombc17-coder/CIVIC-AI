"use client";

import { useEffect, useRef, type RefObject } from "react";
import { calculateChatRoomVisibleHeight } from "@/components/chat-room-visual-viewport";

export function useChatRoomVisualViewportMaxHeight(
  bottomGap: number,
): RefObject<HTMLElement | null> {
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    let frame: number | null = null;

    const updateMaxHeight = () => {
      frame = null;
      const element = elementRef.current;

      if (!element) {
        return;
      }

      const maxHeight = calculateChatRoomVisibleHeight({
        bottomGap,
        viewportHeight: visualViewport?.height ?? window.innerHeight,
      });
      element.style.maxHeight = `${maxHeight}px`;
    };

    const scheduleMaxHeightUpdate = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
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
