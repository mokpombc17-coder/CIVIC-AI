"use client";

import { usePathname } from "next/navigation";
import { VoteTaskListScreen } from "@/components/vote/vote-task-list-screen";
import { VoteTaskScreenLoading } from "@/components/vote/vote-task-screen-loading";

export default function VoteLoading() {
  const pathname = usePathname();

  return resolveVoteLoadingKind(pathname) === "list" ? (
    <VoteTaskListScreen />
  ) : (
    <VoteTaskScreenLoading />
  );
}

export function resolveVoteLoadingKind(pathname: string): "list" | "task" {
  return pathname === "/vote" ? "list" : "task";
}
