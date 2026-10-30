"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useRef, type MouseEvent, type PointerEvent } from "react";
import {
  MOBILE_PRIMARY_POINTER_QUERY,
  preventMobileLinkContextMenu,
} from "@/lib/ui/mobile-link-interaction";

export const PRESS_FEEDBACK_NAVIGATION_DELAY_MS = 50;
// iOS Safari는 길게 눌러도 contextmenu를 보내지 않으므로, 이 시간 이상 누른 터치도 길게 누르기로 봄
export const LONG_PRESS_NAVIGATION_THRESHOLD_MS = 500;

type TouchPress = { longPressed: boolean; startedAt: number };

// 모바일에서 카드를 짧게 탭하면 손을 떼자마자 다음 화면으로 바뀌어 눌림 효과가 보이지 않으므로, 카드 링크 이동을 잠깐 늦춰 눌림 효과가 보일 틈을 줌
// 길게 누른 터치는 브라우저가 click을 보내지 않아 이동하지 않았으므로, 카드 안에서 손을 떼면 지연 없이 바로 이동함
export function usePressFeedbackNavigation<T extends string>(href: Route<T> | null) {
  const router = useRouter();
  const navigatingRef = useRef(false);
  const touchPressRef = useRef<TouchPress | null>(null);
  const longPressNavigatedRef = useRef(false);

  return {
    onClick(event: MouseEvent<HTMLAnchorElement>) {
      // 길게 누르기로 이미 이동했는데 브라우저가 뒤늦게 click을 보내면 한 번 더 이동하지 않게 막음
      if (longPressNavigatedRef.current) {
        longPressNavigatedRef.current = false;
        event.preventDefault();
        return;
      }

      // 마우스로 누르는 기기는 눌림 효과가 원래 속도로 보이므로 지연하지 않고, 새 탭·새 창 열기는 브라우저 기본 동작에 맡김
      if (
        !window.matchMedia(MOBILE_PRIMARY_POINTER_QUERY).matches ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      if (navigatingRef.current) return;

      navigatingRef.current = true;
      window.setTimeout(() => {
        navigatingRef.current = false;
        if (href) router.push(href);
      }, PRESS_FEEDBACK_NAVIGATION_DELAY_MS);
    },
    onContextMenu(event: MouseEvent<HTMLAnchorElement>) {
      preventMobileLinkContextMenu(event);
      if (touchPressRef.current) touchPressRef.current.longPressed = true;
    },
    onPointerDown(event: PointerEvent<HTMLAnchorElement>) {
      longPressNavigatedRef.current = false;
      touchPressRef.current =
        event.pointerType === "touch" ? { longPressed: false, startedAt: event.timeStamp } : null;
    },
    // 손가락이 움직여 스크롤로 바뀌면 브라우저가 터치를 취소하므로 이동하지 않음
    onPointerCancel() {
      touchPressRef.current = null;
    },
    onPointerUp(event: PointerEvent<HTMLAnchorElement>) {
      const press = touchPressRef.current;
      touchPressRef.current = null;
      if (!press || !href) return;

      const longPressed =
        press.longPressed ||
        event.timeStamp - press.startedAt >= LONG_PRESS_NAVIGATION_THRESHOLD_MS;
      if (!longPressed) return;

      // 누른 채 손가락을 카드 밖으로 옮겨 떼면 취소한 것으로 봄
      const card = event.currentTarget.getBoundingClientRect();
      const releasedInsideCard =
        event.clientX >= card.left &&
        event.clientX <= card.right &&
        event.clientY >= card.top &&
        event.clientY <= card.bottom;
      if (!releasedInsideCard) return;

      longPressNavigatedRef.current = true;
      router.push(href);
    },
  };
}
