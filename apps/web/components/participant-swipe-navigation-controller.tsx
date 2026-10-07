"use client";

import { useEffect } from "react";
import { attachParticipantSwipeNavigation } from "./participant-swipe-navigation-runtime";

type ParticipantSwipeNavigationControllerProps = Readonly<{
  currentPathname: string;
}>;

export function ParticipantSwipeNavigationController({
  currentPathname,
}: ParticipantSwipeNavigationControllerProps) {
  useEffect(() => attachParticipantSwipeNavigation({ currentPathname }), [currentPathname]);

  return null;
}
