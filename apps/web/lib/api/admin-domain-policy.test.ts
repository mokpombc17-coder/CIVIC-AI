import { describe, expect, it } from "vitest";
import {
  matchChatAdminRoute,
  matchSimulationAdminRoute,
  matchSimulationOptionsRoute,
  matchSimulationTaskRoute,
  matchSimulationTaskSnapshotRoute,
  matchVoteTaskAdminRoute,
} from "./admin-domain-policy";

const taskId = "7e85d865-4616-4cf5-967c-7d23c27dbf4c";

describe("admin domain route allowlist", () => {
  it("allows only the documented Chat approval methods", () => {
    expect(matchChatAdminRoute("GET", [])).toEqual({
      path: "/api/v1/admin/room-creation-requests",
      scope: "chat:rooms:approve",
    });
    expect(matchChatAdminRoute("POST", ["request-1", "approve"])).toEqual({
      path: "/api/v1/admin/room-creation-requests/request-1/approve",
      scope: "chat:rooms:approve",
    });
    expect(matchChatAdminRoute("DELETE", ["request-1"])).toEqual({
      allowedMethods: ["GET"],
      status: 405,
    });
  });

  it("rejects traversal and undocumented Chat actions", () => {
    expect(matchChatAdminRoute("GET", [".."])).toEqual({ allowedMethods: [], status: 404 });
    expect(matchChatAdminRoute("POST", ["request-1", "edit"])).toEqual({
      allowedMethods: [],
      status: 404,
    });
  });

  it("allows the documented Vote task lifecycle and result routes", () => {
    expect(matchVoteTaskAdminRoute("POST", [])).toEqual({
      path: "/api/v1/admin/tasks",
      scope: "vote:tasks:admin",
    });
    expect(matchVoteTaskAdminRoute("PUT", [taskId, "deadline"])).toEqual({
      path: `/api/v1/admin/tasks/${taskId}/deadline`,
      scope: "vote:tasks:admin",
    });
    expect(matchVoteTaskAdminRoute("GET", [taskId, "result-view"])).toEqual({
      path: `/api/v1/admin/tasks/${taskId}/result-view`,
      scope: "vote:tasks:admin",
    });
  });

  it("requires UUID task identifiers and exact methods", () => {
    expect(matchVoteTaskAdminRoute("GET", ["not-a-uuid"])).toEqual({
      allowedMethods: [],
      status: 404,
    });
    expect(matchVoteTaskAdminRoute("POST", [taskId, "deadline"])).toEqual({
      allowedMethods: ["PUT"],
      status: 405,
    });
  });

  it("allows only aggregate Task simulation routes", () => {
    expect(matchSimulationTaskSnapshotRoute("GET", [])).toEqual({
      path: "/api/v1/admin/simulation-tasks",
      scope: "simulation:tasks:read",
    });
    expect(matchSimulationTaskSnapshotRoute("GET", [taskId])).toEqual({
      path: `/api/v1/admin/simulation-tasks/${taskId}`,
      scope: "simulation:tasks:read",
    });
    expect(matchSimulationTaskRoute("POST", [taskId, "simulations"])).toEqual({
      path: `/api/v1/admin/tasks/${taskId}/simulations`,
      scope: "simulation:tasks:run",
    });
    expect(matchSimulationAdminRoute("GET", [taskId, "results"])).toEqual({
      path: `/api/v1/admin/simulations/${taskId}/results`,
      scope: "simulation:tasks:read",
    });
    expect(matchSimulationAdminRoute("POST", [taskId, "cancel"])).toEqual({
      path: `/api/v1/admin/simulations/${taskId}/cancel`,
      scope: "simulation:tasks:run",
    });
    expect(matchSimulationOptionsRoute("GET")).toEqual({
      path: "/api/v1/admin/simulation-options",
      scope: "simulation:tasks:read",
    });
  });

  it("does not expose individual Persona routes through the simulation proxy", () => {
    expect(matchSimulationTaskSnapshotRoute("POST", [taskId])).toEqual({
      allowedMethods: ["GET"],
      status: 405,
    });
    expect(matchSimulationAdminRoute("GET", [taskId, "personas"])).toEqual({
      allowedMethods: [],
      status: 404,
    });
    expect(matchSimulationTaskRoute("POST", [taskId, "prediction"])).toEqual({
      allowedMethods: [],
      status: 404,
    });
  });
});
