import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoomCreationRequestScreen } from "@/components/chat/room-creation-request-screen";
import { roomCreationRequestIdSchema } from "@/lib/chat/chat-room-contracts";

type RoomCreationRequestPageProps = {
  params: Promise<{
    creationRequestId: string;
  }>;
};

export const metadata: Metadata = {
  title: "토론방 생성 신청",
};

export default async function RoomCreationRequestPage({ params }: RoomCreationRequestPageProps) {
  const { creationRequestId } = await params;
  const parsedCreationRequestId = roomCreationRequestIdSchema.safeParse(creationRequestId);

  if (!parsedCreationRequestId.success) {
    notFound();
  }

  return <RoomCreationRequestScreen creationRequestId={parsedCreationRequestId.data} />;
}
