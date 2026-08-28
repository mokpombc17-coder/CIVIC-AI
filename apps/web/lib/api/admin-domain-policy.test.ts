import { describe, expect, it } from "vitest";
import {
  matchChatAdminRoute,
  matchChatCategoryAdminRoute,
  matchChatRoomCategoryAssignmentRoute,
  matchChatRoomDetailRoute,
  matchChatRoomListRoute,
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
    expect(matchChatRoomListRoute("GET")).toEqual({
      path: "/api/v1/rooms",
      scope: "chat:rooms:read",
    });
    expect(matchChatRoomListRoute("POST")).toEqual({
      allowedMethods: ["GET"],
      status: 405,
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

  it("requires UUID identifiers and rejects Simulation paths", () => {
    expect(matchVoteTaskAdminRoute("GET", ["not-a-uuid"])).toEqual({
      allowedMethods: [],
      status: 404,
    });
    expect(matchVoteTaskAdminRoute("POST", [taskId, "deadline"])).toEqual({
      allowedMethods: ["PUT"],
      status: 405,
    });
    expect(matchVoteTaskAdminRoute("POST", [taskId, "simulations"])).toEqual({
      allowedMethods: [],
      status: 404,
    });
  });
});
