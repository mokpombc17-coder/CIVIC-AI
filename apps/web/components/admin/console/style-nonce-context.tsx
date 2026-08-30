"use client";

import { createContext, useContext, type ReactNode } from "react";

// The CSP (proxy.ts) only allows nonce'd inline styles. AG Grid's Theming API
// injects <style> tags at runtime, so every grid must carry the per-request
// nonce; the admin layout reads it from the x-nonce header and provides it here.
const StyleNonceContext = createContext<string | undefined>(undefined);

export function StyleNonceProvider({
  nonce,
  children,
}: Readonly<{ nonce: string | undefined; children: ReactNode }>) {
  return <StyleNonceContext.Provider value={nonce}>{children}</StyleNonceContext.Provider>;
}

export function useStyleNonce(): string | undefined {
  return useContext(StyleNonceContext);
}
