import type { ReactNode } from "react";
import { ServiceEligibilityGuard } from "@/components/service-eligibility-guard";
import { VoteQueryProvider } from "@/components/vote/vote-query-provider";

export default function VoteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <VoteQueryProvider>
      <ServiceEligibilityGuard title="투표">{children}</ServiceEligibilityGuard>
    </VoteQueryProvider>
  );
}
