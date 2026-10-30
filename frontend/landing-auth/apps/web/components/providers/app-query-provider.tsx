"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { registerAppQueryCacheClearer } from "./query-cache-control";

let browserQueryClient: QueryClient | undefined;

export function getAppQueryClient(): QueryClient {
  if (typeof window === "undefined") return createQueryClient();
  if (!browserQueryClient) {
    const queryClient = createQueryClient();
    browserQueryClient = queryClient;
    registerAppQueryCacheClearer(() => queryClient.clear());
  }
  return browserQueryClient;
}

export function AppQueryProvider({ children }: Readonly<{ children: ReactNode }>) {
  return <QueryClientProvider client={getAppQueryClient()}>{children}</QueryClientProvider>;
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: false,
      },
    },
  });
}
