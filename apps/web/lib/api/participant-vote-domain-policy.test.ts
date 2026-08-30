import { describe, expect, it } from "vitest";
import { matchParticipantVoteRoute } from "./participant-vote-domain-policy";

describe("participant Vote route allowlist", () => {
  it("routes only the current survey and own response endpoints", () => {
    expect(matchParticipantVoteRoute("GET", ["surveys", "current"])).toEqual({
      path: "/api/v1/me/surveys/current",
      scope: "vote:surveys:read",
    });
    expect(matchParticipantVoteRoute("POST", ["survey-responses"])).toEqual({
      path: "/api/v1/me/survey-responses",
      scope: "vote:survey-responses:write",
    });
    expect(matchParticipantVoteRoute("GET", ["survey-responses", "latest"])).toEqual({
      path: "/api/v1/me/survey-responses/latest",
      scope: "vote:surveys:read",
    });
  });

  it("rejects undocumented methods and paths", () => {
    expect(matchParticipantVoteRoute("DELETE", ["survey-responses"])).toEqual({
      allowedMethods: ["GET", "POST"],
      status: 405,
    });
    expect(matchParticipantVoteRoute("GET", ["tasks"])).toEqual({
      allowedMethods: [],
      status: 404,
    });
    expect(matchParticipantVoteRoute("GET", ["survey-responses", ".."])).toEqual({
      allowedMethods: [],
      status: 404,
    });
  });
});
