import type { ReactNode } from "react";
import { VoteQueryProvider } from "@/components/vote/vote-query-provider";

export default function SurveyLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <VoteQueryProvider>{children}</VoteQueryProvider>;
}
