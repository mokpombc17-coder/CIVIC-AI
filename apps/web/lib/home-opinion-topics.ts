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
    id: "tancheon-shared-path",
    question: "탄천변 보행·자전거길,\n혼잡한 시간대에는 어떻게 운영할까요?",
    items: [
      {
        label: "현재 구분 유지",
        ratio: 24,
      },
      {
        // 혼잡 시간대에 자전거도로 일부를 보행 공간으로 전환하는 선택지입니다.
        label: "보행 공간 확대",
        ratio: 20,
      },
      {
        label: "자전거는 내려서 이동",
        ratio: 56,
      },
    ],
  },
] as const;
