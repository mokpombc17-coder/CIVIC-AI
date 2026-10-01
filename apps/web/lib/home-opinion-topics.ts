import type { OpinionItem } from "@/components/screens/opinion-gathering-hero";

export type HomeOpinionTopic = {
  id: string;
  question: string;
  items: readonly [OpinionItem, OpinionItem, OpinionItem];
};

export const HOME_OPINION_TOPICS: readonly HomeOpinionTopic[] = [
  {
    id: "transfer-fare",
    question: "지역마다 다른 전남광주 환승 요금,\n어떻게 하면 좋을까요?",
    items: [
      {
        label: "현행 유지",
        ratio: 20,
      },
      {
        label: "공통안 마련",
        ratio: 48,
      },
      {
        label: "일부 기준 통일",
        ratio: 32,
      },
    ],
  },
  {
    id: "public-parking",
    question: "동네 공영주차장,\n어떤 이용을 우선하면 좋을까요?",
    items: [
      {
        label: "주민·장기 주차 우선",
        ratio: 39,
      },
      {
        label: "방문객·단기 주차 우선",
        ratio: 27,
      },
      {
        label: "선착순 이용",
        ratio: 34,
      },
    ],
  },
  {
    id: "heavy-rain-response",
    question: "집중호우로 인한 도심 침수,\n어디에 먼저 투자할까요?",
    items: [
      {
        label: "하수관로 용량 확대",
        ratio: 56,
      },
      {
        label: "빗물저류시설 확충",
        ratio: 25,
      },
      {
        label: "하천·저지대 정비",
        ratio: 19,
      },
    ],
  },
] as const;
