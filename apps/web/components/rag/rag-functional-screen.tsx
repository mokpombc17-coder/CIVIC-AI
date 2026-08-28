import type { ScreenDefinition } from "@/lib/screens/registry";
import { AdminRagScreen } from "./admin-rag-screen";
import { ParticipantRagScreen } from "./participant-rag-screen";

export type RagQuery = Readonly<Record<string, string | string[] | undefined>>;

export function RagFunctionalScreen({
  screen,
  query = {},
  userId,
}: Readonly<{ screen: ScreenDefinition; query?: RagQuery; userId?: string }>) {
  if (screen.owner !== "RAG" || screen.status !== "FUNCTIONAL") {
    throw new TypeError(`RagFunctionalScreen cannot render ${screen.id}.`);
  }
  return screen.id.startsWith("U-RAG") ? (
    <ParticipantRagScreen query={query} screen={screen} {...(userId ? { userId } : {})} />
  ) : (
    <AdminRagScreen query={query} screen={screen} />
  );
}
