import type { ReactNode } from "react";
import { ServiceEligibilityGuard } from "@/components/service-eligibility-guard";
import { VoteQueryProvider } from "@/components/vote/vote-query-provider";
import { VoteTaskListLoading } from "@/components/vote/vote-task-list-loading";

export default function VoteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <VoteQueryProvider>
      <ServiceEligibilityGuard
        headerSize="compact"
        loadingFallback={<VoteTaskListLoading />}
        title="투표"
      >
        {children}
      </ServiceEligibilityGuard>
    </VoteQueryProvider>
  );
}
