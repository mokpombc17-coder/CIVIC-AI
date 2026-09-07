export const LONG_VOTE_OPTION_CONTENT_THRESHOLD = 10;

export function isLongVoteOptionContent(content: string): boolean {
  return Array.from(content.trim()).length > LONG_VOTE_OPTION_CONTENT_THRESHOLD;
}

export function hasLongVoteOptionContent(
  options: readonly Readonly<{ content: string }>[],
): boolean {
  return options.some((option) => isLongVoteOptionContent(option.content));
}
