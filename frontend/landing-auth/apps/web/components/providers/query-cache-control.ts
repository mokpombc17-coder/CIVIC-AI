type QueryCacheClearer = () => void;

let loadedQueryCacheClearer: QueryCacheClearer | undefined;

/** Register the browser QueryClient once it exists; its cache outlives provider mounts. */
export function registerAppQueryCacheClearer(clearer: QueryCacheClearer): void {
  loadedQueryCacheClearer = clearer;
}

/** Clear an existing cache without loading the React Query implementation. */
export function clearAppQueryCacheIfLoaded(): void {
  loadedQueryCacheClearer?.();
}
