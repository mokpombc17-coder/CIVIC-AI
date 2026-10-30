import {
  associationResponse,
  createAppleAppSiteAssociation,
} from "@/lib/server/mobile-association";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return associationResponse(createAppleAppSiteAssociation());
}
