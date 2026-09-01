import type { Metadata } from "next";
import { SurveyScreen } from "@/components/survey/survey-screen";
import { resolveSurveyReturnPath } from "@/lib/survey/survey-navigation";

export const metadata: Metadata = {
  title: "설문조사",
};

type SurveyPageProps = Readonly<{
  searchParams: Promise<Readonly<{ from?: string | readonly string[] | undefined }>>;
}>;

export default async function SurveyPage({ searchParams }: SurveyPageProps) {
  const { from } = await searchParams;

  return <SurveyScreen cancelHref={resolveSurveyReturnPath(from)} />;
}
