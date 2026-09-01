import type { Metadata } from "next";
import { SurveyPreparationScreen } from "@/components/survey/survey-preparation-screen";

export const metadata: Metadata = {
  title: "설문조사",
};

export default function SurveyPage() {
  return <SurveyPreparationScreen />;
}
