import type { Metadata } from "next";
import { SurveyScreen } from "@/components/survey/survey-screen";
import { resolveSurveyReturnPath } from "@/lib/survey/survey-navigation";

export const metadata: Metadata = {
  title: "설문조사",
};

type SurveyPageProps = Readonly<{
  searchParams: Promise<Readonly<{ returnTo?: string | readonly string[] | undefined }>>;
}>;

export default async function SurveyPage({ searchParams }: SurveyPageProps) {
  const { returnTo } = await searchParams;

  return <SurveyScreen returnTo={resolveSurveyReturnPath(returnTo)} />;
}
