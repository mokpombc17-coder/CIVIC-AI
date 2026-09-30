import { describe, expect, it } from "vitest";
import { participantScreenScroll } from "./participant-screen-scroll";

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
