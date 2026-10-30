import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readCivicProductionServiceConfig } from "./production-service-config";

describe("production service config", () => {
  it("Web BFF가 소유한 Main/Auth, Chat, Vote 주소만 읽는다", () => {
    expect(
      readCivicProductionServiceConfig({
        NODE_ENV: "test",
        CIVIC_BROWSER_ORIGIN: "https://civic.example",
        MAIN_AUTH_INTERNAL_URL: "http://main-auth:8080",
        CHAT_INTERNAL_URL: "http://chat:8083",
        VOTE_INTERNAL_URL: "http://vote:8082",
        RAG_INTERNAL_URL: "http://rag-api:8000",
        SIMULATION_INTERNAL_URL: "http://simulation-api:8090",
      }),
    ).toEqual({
      browserOrigin: "https://civic.example",
      mainAuthUrl: "http://main-auth:8080",
      chatUrl: "http://chat:8083",
      voteUrl: "http://vote:8082",
    });
  });
});
