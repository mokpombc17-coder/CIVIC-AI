package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.task.domain.common.TaskUserId;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;

import java.util.Map;
import java.util.Objects;

final class LocalTaskPredictionReasonFactory {

    private static final Map<String, Perspective> STAGING_PERSPECTIVES =
            Map.ofEntries(
                    Map.entry(
                            "46fd4756-f07f-4b54-b03a-6e07740317da",
                            Perspective.PRACTICAL_EFFICIENCY),
                    Map.entry(
                            "4af25cff-f0ad-4a43-ad4f-5f556dcdff5b",
                            Perspective.SAFETY_STABILITY),
                    Map.entry(
                            "89074124-2d0f-4cc1-b14e-8e8a3c5e933f",
                            Perspective.COMMUNITY_CARE),
                    Map.entry(
                            "7f099599-04a3-4d25-9798-15a491e1ff32",
                            Perspective.FUTURE_GROWTH),
                    Map.entry(
                            "77b1499c-6951-4242-8ce8-d8a5b9d31621",
                            Perspective.FAIR_ACCESS),
                    Map.entry(
                            "69230d56-11b5-42dd-9eea-a8116c005fc5",
                            Perspective.FISCAL_FEASIBILITY),
                    Map.entry(
                            "352e7eab-ed90-4c7f-8628-483c4a5404aa",
                            Perspective.SUSTAINABILITY),
                    Map.entry(
                            "cbf68442-aa94-4502-9911-9e1e348214b8",
                            Perspective.QUALITY_OF_LIFE),
                    Map.entry(
                            "74d8b3c6-86ed-44bd-abf6-8af36f21d753",
                            Perspective.INNOVATION));

    private LocalTaskPredictionReasonFactory() {
    }

    static String reason(
            TaskUserId userId,
            Task task,
            TaskOption option,
            int reasonOrder
    ) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(task, "task");
        Objects.requireNonNull(option, "option");
        Perspective perspective = STAGING_PERSPECTIVES.getOrDefault(
                userId.value(), fallbackPerspective(userId));
        return perspective.reason(reasonOrder, task.title(), option.content());
    }

    private static Perspective fallbackPerspective(TaskUserId userId) {
        Perspective[] values = Perspective.values();
        int index = Math.floorMod(userId.value().hashCode(), values.length);
        return values[index];
    }

    private enum Perspective {
        PRACTICAL_EFFICIENCY(
                "‘%s’에서는 ‘%s’ 선택이 일상에서 가장 빠르게 체감할 수 "
                        + "있는 변화를 만든다고 봅니다. 반복되는 불편과 시간 비용을 "
                        + "줄이는 데 직접 도움이 될 가능성을 중요하게 고려했습니다.",
                "‘%s’의 ‘%s’ 선택은 투입한 자원 대비 효과를 구체적으로 "
                        + "확인하기 좋다고 생각합니다. 실행 결과를 생활 편의의 개선 "
                        + "정도로 비교하고 평가할 수 있다는 점도 장점입니다."),
        SAFETY_STABILITY(
                "‘%s’에서는 ‘%s’ 선택이 예상되는 위험과 불편을 미리 줄이는 "
                        + "데 도움이 된다고 봅니다. 주민이 안심하고 일상을 이어갈 수 "
                        + "있는 안정적인 환경을 만드는 일을 우선했습니다.",
                "‘%s’의 ‘%s’ 선택은 급격한 변화보다 꾸준히 유지되는 개선을 "
                        + "만들 가능성이 큽니다. 문제가 생겼을 때 대응하기 쉽고 운영의 "
                        + "예측 가능성을 높일 수 있다는 점을 중요하게 봤습니다."),
        COMMUNITY_CARE(
                "‘%s’에서는 ‘%s’ 선택이 개인의 편의를 넘어 이웃 전체에 고르게 "
                        + "도움이 될 수 있다고 봅니다. 주민 간 연결과 협력을 넓혀 지역 "
                        + "공동체의 기반을 단단하게 만들 수 있기 때문입니다.",
                "‘%s’의 ‘%s’ 선택은 도움이 더 필요한 주민도 함께 혜택을 받을 "
                        + "수 있는 방향이라고 생각합니다. 누구도 배제되지 않고 서로 "
                        + "돌볼 수 있는 생활환경을 만드는 데 의미가 있습니다."),
        FUTURE_GROWTH(
                "‘%s’에서는 ‘%s’ 선택이 당장의 개선과 함께 지역의 장기적인 "
                        + "성장 기반을 만든다고 봅니다. 지금의 투자가 앞으로 더 많은 "
                        + "기회와 선택지를 열어 줄 가능성을 중요하게 고려했습니다.",
                "‘%s’의 ‘%s’ 선택은 미래 세대가 더 나은 환경에서 생활할 수 "
                        + "있도록 준비하는 결정이라고 생각합니다. 단기 성과에 그치지 "
                        + "않고 시간이 지날수록 가치가 커질 수 있다는 점에 주목했습니다."),
        FAIR_ACCESS(
                "‘%s’에서는 ‘%s’ 선택이 연령이나 생활 조건에 관계없이 누구나 "
                        + "이용하기 쉬운 변화를 만든다고 봅니다. 접근하기 어려웠던 "
                        + "주민의 불편을 줄이는 것이 지역 전체의 형평성을 높이는 "
                        + "길이라고 생각했습니다.",
                "‘%s’의 ‘%s’ 선택은 혜택이 특정 집단에 치우치지 않고 넓게 "
                        + "돌아갈 가능성이 큽니다. 출발점이 다른 주민도 비슷한 기회를 "
                        + "누릴 수 있도록 만드는 점을 중요하게 봤습니다."),
        FISCAL_FEASIBILITY(
                "‘%s’에서는 ‘%s’ 선택이 비용 대비 효과와 실제 집행 가능성 "
                        + "사이의 균형이 좋다고 봅니다. 계획에 머물지 않고 제한된 예산 "
                        + "안에서 현실적으로 추진할 수 있는지를 우선적으로 고려했습니다.",
                "‘%s’의 ‘%s’ 선택은 초기 투자뿐 아니라 이후의 유지·운영 부담도 "
                        + "관리하기 좋다고 생각합니다. 장기간 안정적으로 계속할 수 있어 "
                        + "예산의 책임성을 높일 수 있다는 점이 중요합니다."),
        SUSTAINABILITY(
                "‘%s’에서는 ‘%s’ 선택이 생활 편의를 높이면서도 지역의 환경 "
                        + "부담을 줄일 여지가 있다고 봅니다. 현재의 필요를 충족하되 "
                        + "자연과 자원을 과도하게 소모하지 않는 방향을 중요하게 "
                        + "생각했습니다.",
                "‘%s’의 ‘%s’ 선택은 단기적인 성과보다 지속 가능한 지역 운영에 "
                        + "도움이 될 수 있습니다. 다음 세대도 같은 혜택을 누릴 수 있도록 "
                        + "장기적인 영향을 함께 고려해야 한다고 봤습니다."),
        QUALITY_OF_LIFE(
                "‘%s’에서는 ‘%s’ 선택이 주민이 매일 느끼는 만족감과 생활의 "
                        + "활력을 높일 수 있다고 봅니다. 단순히 불편을 없애는 것을 넘어 "
                        + "지역에서 보내는 시간을 더 즐겁게 만드는 점을 중요하게 "
                        + "여겼습니다.",
                "‘%s’의 ‘%s’ 선택은 사람들이 지역에 머물고 서로 교류하고 싶은 "
                        + "환경을 만드는 데 도움이 됩니다. 일상 속 경험의 질을 높여 "
                        + "지역에 대한 애착을 키울 수 있다고 생각했습니다."),
        INNOVATION(
                "‘%s’에서는 ‘%s’ 선택이 기존 방식으로 해결하기 어려웠던 문제에 "
                        + "새로운 돌파구를 만들 수 있다고 봅니다. 변화하는 주민의 요구에 "
                        + "더 빠르고 유연하게 대응할 가능성을 중요하게 평가했습니다.",
                "‘%s’의 ‘%s’ 선택은 작은 실험에서 시작해 효과가 확인되면 다른 "
                        + "분야로 확장하기 좋은 방향입니다. 새로운 방법을 시도하면서도 "
                        + "결과를 학습해 다음 결정을 개선할 수 있다는 점에 주목했습니다.");

        private final String firstReason;
        private final String secondReason;

        Perspective(String firstReason, String secondReason) {
            this.firstReason = firstReason;
            this.secondReason = secondReason;
        }

        private String reason(
                int reasonOrder,
                String taskTitle,
                String optionContent
        ) {
            String template = switch (reasonOrder) {
                case 1 -> firstReason;
                case 2 -> secondReason;
                default -> throw new IllegalArgumentException(
                        "reasonOrder must be 1 or 2");
            };
            return template.formatted(taskTitle, optionContent);
        }
    }
}
