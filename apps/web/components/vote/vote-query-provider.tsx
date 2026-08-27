"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect, type ReactNode } from "react";
import { observeAuthenticationSucceeded } from "@/lib/auth/authentication-session-events";
import { getVoteQueryClient } from "@/lib/vote/vote-query-client";

export function VoteQueryProvider({ children }: { children: ReactNode }) {
  const queryClient = getVoteQueryClient();

  useEffect(
    () =>
      observeAuthenticationSucceeded(window, () => {
        queryClient.removeQueries({ queryKey: ["vote"] });
      }),
    [queryClient],
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}
