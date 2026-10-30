"use client";

import { useEffect, useState, type RefObject } from "react";
import { usePlatformShellContentScroll } from "./platform-shell-content-scroll";
import styles from "./platform-shell.module.css";

export type PlatformScrollTopButtonProps = Readonly<{
  anchorRef: RefObject<Element | null>;
}>;

export function PlatformScrollTopButton({ anchorRef }: PlatformScrollTopButtonProps) {
  const { scrollToTop } = usePlatformShellContentScroll();
  const anchorVisible = useAnchorVisible(anchorRef);

  return (
    <button
      aria-label="맨 위로"
      className={styles.scrollTopButton}
      data-visible={anchorVisible ? "false" : "true"}
      onClick={scrollToTop}
      type="button"
    >
      <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 20 20" width="20">
        <path
          d="M10 15.5V4.5M10 4.5L5 9.5M10 4.5L15 9.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    </button>
  );
}

// 화면 위쪽 요소(anchor)가 content 스크롤에 밀려 안 보일 때만 버튼을 보여 주려고, anchor가 화면에 보이는지 지켜봄
// IntersectionObserver가 없는 환경에서는 anchor가 계속 보이는 것으로 두어 버튼을 숨김
function useAnchorVisible(anchorRef: RefObject<Element | null>): boolean {
  const [anchorVisible, setAnchorVisible] = useState(true);

  useEffect(() => {
    const anchor = anchorRef.current;

    if (!anchor || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry) {
        setAnchorVisible(entry.isIntersecting);
      }
    });
    observer.observe(anchor);

    return () => {
      observer.disconnect();
    };
  }, [anchorRef]);

  return anchorVisible;
}
