package com.hamcheeze.vote.task.application.result;

import java.util.Objects;

/** Frontend-facing Opinion Map projection for the current user's choice. */
public record MyTaskOpinionMap(
        Status status,
        Area sameChoice,
        Area otherChoices
) {

    public MyTaskOpinionMap {
        Objects.requireNonNull(status, "status");
        if (status == Status.AVAILABLE) {
            Objects.requireNonNull(sameChoice, "sameChoice");
            Objects.requireNonNull(otherChoices, "otherChoices");
        } else if (sameChoice != null || otherChoices != null) {
            throw new IllegalArgumentException(
                    "opinion areas must be null unless status is AVAILABLE");
        }
    }

    public static MyTaskOpinionMap pending() {
        return new MyTaskOpinionMap(Status.PENDING, null, null);
    }

    public static MyTaskOpinionMap unavailable() {
        return new MyTaskOpinionMap(Status.UNAVAILABLE, null, null);
    }

    public static MyTaskOpinionMap available(
            OpinionMapOptionExplanationV1 explanation,
            int selectedOptionDisplayOrder
    ) {
        Objects.requireNonNull(explanation, "explanation");
        if (explanation.status()
                != OpinionMapOptionExplanationV1.GenerationStatus.COMPLETED) {
            throw new IllegalArgumentException(
                    "only completed explanations can be made available");
        }
        if (selectedOptionDisplayOrder < 1) {
            throw new IllegalArgumentException(
                    "selectedOptionDisplayOrder must be positive");
        }
        String selectedOptionKey = "O" + selectedOptionDisplayOrder;
        OpinionMapOptionExplanationV1.OptionSummary selected =
                explanation.optionSummaries().stream()
                        .filter(summary -> selectedOptionKey.equals(
                                summary.optionKey()))
                        .findFirst()
                        .orElseThrow(() -> new IllegalArgumentException(
                                "selected option summary does not exist"));
        return new MyTaskOpinionMap(
                Status.AVAILABLE,
                Area.from(selected.sameChoice()),
                Area.from(selected.otherChoices()));
    }

    public record Area(AreaStatus status, String body) {

        public Area {
            Objects.requireNonNull(status, "status");
            if (status == AreaStatus.AVAILABLE) {
                body = requireText(body, "body");
            } else if (body != null) {
                throw new IllegalArgumentException(
                        "body must be null unless status is AVAILABLE");
            }
        }

        private static Area from(
                OpinionMapOptionExplanationV1.AreaSummary source
        ) {
            return new Area(
                    AreaStatus.valueOf(source.status().name()),
                    source.body());
        }
    }

    public enum Status {
        PENDING,
        AVAILABLE,
        UNAVAILABLE
    }

    public enum AreaStatus {
        AVAILABLE,
        NO_RESPONSES,
        INSUFFICIENT_REASON
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field);
        String normalized = value.strip();
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return normalized;
    }
}
