export type ChatMessageClipboard = Readonly<{
  writeText: (content: string) => Promise<void>;
}>;

export async function copyChatMessageContent(
  content: string,
  clipboard: ChatMessageClipboard | undefined = getBrowserClipboard(),
): Promise<void> {
  if (!clipboard) {
    throw new Error("이 브라우저에서는 메시지 복사를 사용할 수 없습니다.");
  }

  await clipboard.writeText(content);
}

function getBrowserClipboard(): ChatMessageClipboard | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.clipboard;
}
