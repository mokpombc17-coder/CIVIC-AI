import { describe, expect, it } from "vitest";
import {
  participantScreenScroll,
  participantScreenUsesVisualViewport,
} from "./participant-screen-scroll";

describe("participantScreenScroll", () => {
  it.each(["U-RAG-001", "U-ACCOUNT-001", "U-ACCOUNT-002", "U-ACCOUNT-004"])(
    "delegates %s scrolling to its child content region",
    (screenId) => expect(participantScreenScroll(screenId)).toBe("child"),
  );

  it.each(["U-HOME-001", "U-ACCOUNT-003", "U-VOTE-001"])(
    "keeps %s scrolling on the platform shell",
    (screenId) => expect(participantScreenScroll(screenId)).toBe("self"),
  );
});

describe("participantScreenUsesVisualViewport", () => {
  it.each(["U-ACCOUNT-001", "U-ACCOUNT-002", "U-ACCOUNT-004"])(
    "enables visual viewport sizing for %s",
    (screenId) => expect(participantScreenUsesVisualViewport(screenId)).toBe(true),
  );

  it.each(["U-HOME-001", "U-RAG-001", "U-ACCOUNT-003", "U-VOTE-001"])(
    "leaves %s on its existing viewport sizing",
    (screenId) => expect(participantScreenUsesVisualViewport(screenId)).toBe(false),
  );
});
