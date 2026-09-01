import type { Metadata } from "next";
import { SurveyResponseScreen } from "@/components/survey/survey-response-screen";

export const metadata: Metadata = {
  title: "내 설문 응답",
};

export default async function SurveyResponsePage({
  params,
}: {
  params: Promise<{ responseId: string }>;
}) {
  const { responseId } = await params;
  return <SurveyResponseScreen responseId={responseId} />;
}
