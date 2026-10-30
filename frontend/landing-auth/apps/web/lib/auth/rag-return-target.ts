type RagReturnQuery = Readonly<Record<string, string | string[] | undefined>>;

export function ragReturnTarget(pathname: string, query: RagReturnQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) for (const item of value) params.append(key, item);
  }
  const serialized = params.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}
