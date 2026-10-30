package com.hamcheeze.vote.survey.api;

import com.hamcheeze.vote.survey.domain.common.SurveyViolation;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

import java.net.URI;
import java.util.List;
import java.util.Locale;
import java.util.Map;

final class SurveyProblemDetails {

    private SurveyProblemDetails() {
    }

    static ProblemDetail create(
            HttpStatus status,
            String code,
            String detail,
            URI instance,
            boolean replayed,
            List<SurveyViolation> violations
    ) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                status, detail);
        problem.setType(URI.create("urn:hamcheeze:problem:"
                + code.toLowerCase(Locale.ROOT).replace('_', '-')));
        problem.setTitle(title(code));
        problem.setInstance(instance);
        problem.setProperty("code", code);
        problem.setProperty("replayed", replayed);
        problem.setProperty("retryable", false);
        if (!violations.isEmpty()) {
            problem.setProperty("violations", violations.stream()
                    .map(violation -> Map.of(
                            "code", violation.code(),
                            "path", violation.path(),
                            "message", violation.message(),
                            "details", violation.details()))
                    .toList());
        }
        return problem;
    }

    private static String title(String code) {
        return switch (code) {
            case "SURVEY_ACTIVE_ROUND_UNAVAILABLE" ->
                    "Active survey round unavailable";
            case "SURVEY_CONTENT_NOT_FOUND" ->
                    "Survey content not found";
            case "SURVEY_ROUND_NOT_FOUND" -> "Survey round not found";
            case "SURVEY_RESPONSE_NOT_FOUND" ->
                    "Survey response not found";
            case "INVALID_IDEMPOTENCY_KEY" ->
                    "Invalid idempotency key";
            case "IDEMPOTENCY_CONFLICT" -> "Idempotency conflict";
            case "INVALID_REQUEST" -> "Invalid request";
            default -> "Survey request rejected";
        };
    }
}
