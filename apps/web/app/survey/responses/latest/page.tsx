import type { Metadata } from "next";
import { SurveyResponseScreen } from "@/components/survey/survey-response-screen";

export const metadata: Metadata = {
  title: "내 설문 응답",
};

export default function LatestSurveyResponsePage() {
  return <SurveyResponseScreen />;
}
