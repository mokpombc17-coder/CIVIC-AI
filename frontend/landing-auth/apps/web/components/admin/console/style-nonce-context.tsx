"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// The CSP (proxy.ts) only allows nonce'd inline styles. AG Grid's Theming API
// injects <style> tags at runtime, so every grid must carry the nonce from the
// document response. RSC navigations receive fresh request nonces without
// replacing the document CSP, so this provider keeps the initial document
// value stable for its entire mounted lifetime.
const StyleNonceContext = createContext<string | undefined>(undefined);

export function StyleNonceProvider({
  nonce,
  children,
}: Readonly<{ nonce: string | undefined; children: ReactNode }>) {
  const [documentNonce] = useState(nonce);
  return <StyleNonceContext.Provider value={documentNonce}>{children}</StyleNonceContext.Provider>;
}

export function useStyleNonce(): string | undefined {
  return useContext(StyleNonceContext);
}
