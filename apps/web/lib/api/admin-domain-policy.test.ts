import { describe, expect, it } from "vitest";
import {
  matchChatAdminRoomCloseRoute,
  matchChatAdminRoomListRoute,
  matchChatAdminRoute,
  matchChatCategoryAdminRoute,
  matchChatConversationExportRoute,
  matchChatRoomCategoryAssignmentRoute,
  matchChatRoomDetailRoute,
  matchChatRoomListRoute,
  matchOpinionMapGenerationAdminRoute,
  matchVoteTaskAdminRoute,
} from "./admin-domain-policy";

const taskId = "7e85d865-4616-4cf5-967c-7d23c27dbf4c";
const roomId = "4a52affd-77e8-4bee-86c1-8b74c2ea45ae";

describe("admin domain route allowlist", () => {
  it("allows only GET with the admin scope for task progress summaries", () => {
    expect(matchVoteTaskAdminRoute("GET", [taskId, "progress-summary"])).toEqual({
      path: `/api/v1/admin/tasks/${taskId}/progress-summary`,
      scope: "vote:tasks:admin",
    });
    expect(matchVoteTaskAdminRoute("POST", [taskId, "progress-summary"])).toEqual({
      allowedMethods: ["GET"],
      status: 405,
    });
  });
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
    expect(matchChatAdminRoomListRoute("GET")).toEqual({
      path: "/api/v1/admin/rooms",
      scope: "chat:categories:manage",
    });
    expect(matchChatAdminRoomListRoute("POST")).toEqual({
      allowedMethods: ["GET"],
      status: 405,
    });
    expect(matchChatAdminRoomCloseRoute("POST", roomId)).toEqual({
      path: `/api/v1/admin/rooms/${roomId}/commands/close`,
      scope: "chat:rooms:approve",
    });
    expect(matchChatAdminRoomCloseRoute("GET", roomId)).toEqual({
      allowedMethods: ["POST"],
      status: 405,
    });
    expect(matchChatAdminRoomCloseRoute("POST", "room-1")).toEqual({
      allowedMethods: [],
      status: 404,
    });
    expect(matchChatConversationExportRoute("POST", "room-1")).toEqual({
      path: "/api/v1/admin/rooms/room-1/conversation-exports",
      scope: "chat:audit:exports",
    });
    expect(matchChatConversationExportRoute("GET", "room-1")).toEqual({
      allowedMethods: ["POST"],
      status: 405,
    });
    expect(matchChatConversationExportRoute("POST", "..")).toEqual({
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
    expect(matchVoteTaskAdminRoute("POST", [taskId, "preparation"])).toEqual({
      path: `/api/v1/admin/tasks/${taskId}/preparation`,
      scope: "vote:tasks:admin",
    });
    expect(matchVoteTaskAdminRoute("GET", [taskId, "preparation"])).toEqual({
      allowedMethods: ["POST"],
      status: 405,
    });
    expect(matchVoteTaskAdminRoute("POST", [taskId, "opinion-map-generation"])).toEqual({
      path: `/api/v1/admin/tasks/${taskId}/opinion-map-generation`,
      scope: "vote:tasks:admin",
    });
    expect(matchVoteTaskAdminRoute("GET", [taskId, "opinion-map-generation"])).toEqual({
      allowedMethods: ["POST"],
      status: 405,
    });
  });

  it("allows only the unavailable Opinion Map generation list", () => {
    expect(matchOpinionMapGenerationAdminRoute("GET", ["unavailable"])).toEqual({
      path: "/api/v1/admin/opinion-map-generations/unavailable",
      scope: "vote:tasks:admin",
    });
    expect(matchOpinionMapGenerationAdminRoute("POST", ["unavailable"])).toEqual({
      allowedMethods: ["GET"],
      status: 405,
    });
    expect(matchOpinionMapGenerationAdminRoute("GET", ["pending"])).toEqual({
      allowedMethods: [],
      status: 404,
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
