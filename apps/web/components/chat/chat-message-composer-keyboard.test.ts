import { describe, expect, it } from "vitest";
import { getChatMessageComposerKeyAction } from "./chat-message-composer-keyboard";

describe("getChatMessageComposerKeyAction", () => {
  it("submits on Enter", () => {
    expect(
      getChatMessageComposerKeyAction({
        isComposing: false,
        key: "Enter",
        shiftKey: false,
      }),
    ).toBe("submit");
  });

  it("inserts a newline on Shift+Enter", () => {
    expect(
      getChatMessageComposerKeyAction({
        isComposing: false,
        key: "Enter",
        shiftKey: true,
      }),
    ).toBe("insert-newline");
  });

  it("ignores Enter while an IME composition is active", () => {
    expect(
      getChatMessageComposerKeyAction({
        isComposing: true,
        key: "Enter",
        shiftKey: false,
      }),
    ).toBe("ignore");
    expect(
      getChatMessageComposerKeyAction({
        isComposing: false,
        key: "Enter",
        keyCode: 229,
        shiftKey: false,
      }),
    ).toBe("ignore");
  });

  it("leaves non-Enter keys to the textarea", () => {
    expect(
      getChatMessageComposerKeyAction({
        isComposing: false,
        key: "a",
        shiftKey: false,
      }),
    ).toBe("ignore");
  });
});
