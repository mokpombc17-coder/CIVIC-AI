import { cookies } from "next/headers";
import { PLATFORM_AUTH_COOKIE_NAME } from "@/lib/server/auth/platform-auth-contract";
import { proxyChatRoomExport } from "@/lib/server/chat/chat-room-export-proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ChatRoomExportRouteContext = Readonly<{
  params: Promise<Readonly<{ roomId: string }>>;
}>;

export async function POST(
  request: Request,
  { params }: ChatRoomExportRouteContext,
): Promise<Response> {
  const [{ roomId }, cookieStore] = await Promise.all([params, cookies()]);

  return proxyChatRoomExport({
    accessToken: cookieStore.get(PLATFORM_AUTH_COOKIE_NAME)?.value,
    request,
    roomId,
  });
}
