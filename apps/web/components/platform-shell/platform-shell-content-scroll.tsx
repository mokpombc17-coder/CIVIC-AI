"use client";

import { createContext, useContext } from "react";

export type PlatformShellContentScroll = Readonly<{
  scrollToTop: () => void;
}>;

export const PlatformShellContentScrollContext = createContext<PlatformShellContentScroll | null>(
  null,
);

// 도메인 화면은 실제 shell element에 접근하지 않으므로, content 스크롤을 맨 위로 올리는 동작만 shell에게서 받아 씀
// shell 밖에서 렌더링되면 올릴 스크롤이 없으므로 아무 동작도 하지 않음
export function usePlatformShellContentScroll(): PlatformShellContentScroll {
  return useContext(PlatformShellContentScrollContext) ?? NOOP_CONTENT_SCROLL;
}

const NOOP_CONTENT_SCROLL: PlatformShellContentScroll = { scrollToTop: () => {} };
