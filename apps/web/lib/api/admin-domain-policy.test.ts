import { describe, expect, it } from "vitest";
import {
  matchChatAdminRoute,
  matchChatCategoryAdminRoute,
  matchChatRoomCategoryAssignmentRoute,
  matchChatRoomDetailRoute,
  matchSimulationAdminRoute,
  matchSimulationBillingRoute,
  matchSimulationCapacityRoute,
  matchSimulationOptionsRoute,
  matchSimulationTaskCatalogRoute,
  matchSimulationTaskRoute,
  matchVoteTaskAdminRoute,
} from "./admin-domain-policy";

const taskId = "7e85d865-4616-4cf5-967c-7d23c27dbf4c";
const fixtureTaskId = "13000000-0000-0000-0000-000000000001";

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

  it("allows only the documented Chat category administration methods", () => {
    expect(matchChatCategoryAdminRoute("GET", [])).toEqual({
      path: "/api/v1/admin/room-categories",
      scope: "chat:categories:manage",
    });
    expect(matchChatCategoryAdminRoute("POST", [])).toEqual({
      path: "/api/v1/admin/room-categories",
      scope: "chat:categories:manage",
    });
    expect(matchChatCategoryAdminRoute("PATCH", ["category-1"])).toEqual({
      path: "/api/v1/admin/room-categories/category-1",
      scope: "chat:categories:manage",
    });
    expect(matchChatCategoryAdminRoute("DELETE", ["category-1"])).toEqual({
      path: "/api/v1/admin/room-categories/category-1",
      scope: "chat:categories:manage",
    });
    expect(matchChatCategoryAdminRoute("PUT", ["category-1"])).toEqual({
      allowedMethods: ["GET", "PATCH", "DELETE"],
      status: 405,
    });
    expect(matchChatRoomCategoryAssignmentRoute("PUT", "room-1")).toEqual({
      path: "/api/v1/admin/rooms/room-1/categories",
      scope: "chat:categories:manage",
    });
    expect(matchChatRoomCategoryAssignmentRoute("GET", "room-1")).toEqual({
      allowedMethods: ["PUT"],
      status: 405,
    });
    expect(matchChatRoomDetailRoute("GET", "room-1")).toEqual({
      path: "/api/v1/rooms/room-1",
      scope: "chat:rooms:read",
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
    expect(matchSimulationTaskCatalogRoute("GET", [])).toEqual({
      path: "/api/v1/admin/simulation-tasks",
      scope: "simulation:tasks:read",
    });
    expect(matchSimulationTaskCatalogRoute("GET", [taskId])).toEqual({
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
    expect(matchSimulationAdminRoute("POST", [taskId, "retry-failed"])).toEqual({
      path: `/api/v1/admin/simulations/${taskId}/retry-failed`,
      scope: "simulation:tasks:run",
    });
    expect(matchSimulationCapacityRoute("POST")).toEqual({
      path: "/api/v1/admin/simulation-capacity",
      scope: "simulation:tasks:read",
    });
    expect(matchSimulationOptionsRoute("GET")).toEqual({
      path: "/api/v1/admin/simulation-options",
      scope: "simulation:tasks:read",
    });
    expect(matchSimulationTaskRoute("POST", [taskId, "simulations", "preview"])).toEqual({
      path: `/api/v1/admin/tasks/${taskId}/simulations/preview`,
      scope: "simulation:tasks:read",
    });
    expect(matchSimulationTaskCatalogRoute("POST", [])).toEqual({
      allowedMethods: ["GET"],
      status: 405,
    });
    expect(matchSimulationTaskCatalogRoute("GET", [taskId, "personas"])).toEqual({
      allowedMethods: [],
      status: 404,
    });
    expect(matchSimulationCapacityRoute("GET")).toEqual({
      allowedMethods: ["POST"],
      status: 405,
    });
  });

  it("accepts canonical Vote fixture UUIDs without requiring version or variant bits", () => {
    expect(matchSimulationTaskCatalogRoute("GET", [fixtureTaskId])).toEqual({
      path: `/api/v1/admin/simulation-tasks/${fixtureTaskId}`,
      scope: "simulation:tasks:read",
    });
    expect(matchSimulationTaskRoute("GET", [fixtureTaskId, "simulations"])).toEqual({
      path: `/api/v1/admin/tasks/${fixtureTaskId}/simulations`,
      scope: "simulation:tasks:read",
    });
    expect(matchSimulationTaskRoute("POST", [fixtureTaskId, "simulations"])).toEqual({
      path: `/api/v1/admin/tasks/${fixtureTaskId}/simulations`,
      scope: "simulation:tasks:run",
    });
    expect(matchSimulationTaskRoute("POST", [fixtureTaskId, "simulations", "preview"])).toEqual({
      path: `/api/v1/admin/tasks/${fixtureTaskId}/simulations/preview`,
      scope: "simulation:tasks:read",
    });
    expect(matchSimulationTaskCatalogRoute("GET", [".."])).toEqual({
      allowedMethods: [],
      status: 404,
    });
    expect(matchSimulationTaskRoute("POST", ["not-a-uuid", "simulations", "preview"])).toEqual({
      allowedMethods: [],
      status: 404,
    });
  });

  it("allows the documented simulation billing surface only", () => {
    expect(matchSimulationBillingRoute("GET", ["wallet"])).toEqual({
      path: "/api/v1/admin/simulation-billing/wallet",
      scope: "simulation:billing:read",
    });
    expect(matchSimulationBillingRoute("POST", ["coupons", "redeem"])).toEqual({
      path: "/api/v1/admin/simulation-billing/coupons/redeem",
      scope: "simulation:billing:write",
    });
    expect(
      matchSimulationBillingRoute("POST", ["policies", "provider-prices", "2", "activate"]),
    ).toEqual({
      path: "/api/v1/admin/simulation-billing/policies/provider-prices/2/activate",
      scope: "simulation:billing:write",
    });
    expect(matchSimulationBillingRoute("GET", ["imports", "latest"])).toEqual({
      path: "/api/v1/admin/simulation-billing/imports/latest",
      scope: "simulation:billing:read",
    });
    expect(matchSimulationBillingRoute("GET", ["reports", "daily.csv"])).toEqual({
      path: "/api/v1/admin/simulation-billing/reports/daily.csv",
      scope: "simulation:billing:read",
    });
    expect(matchSimulationBillingRoute("DELETE", ["wallet"])).toEqual({
      allowedMethods: ["GET"],
      status: 405,
    });
    expect(matchSimulationBillingRoute("POST", ["wallet", "credit"])).toEqual({
      allowedMethods: [],
      status: 404,
    });
  });

  it("does not expose individual Persona routes through the simulation proxy", () => {
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
