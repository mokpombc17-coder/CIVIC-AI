package com.hamcheeze.vote.task.api;

import com.hamcheeze.vote.task.domain.common.TaskViolation;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

import java.net.URI;
import java.util.List;
import java.util.Locale;

final class TaskProblemDetails {

    private TaskProblemDetails() {
    }

    static ProblemDetail create(
            HttpStatus status,
            String code,
            String detail,
            URI instance,
            boolean replayed,
            List<TaskViolation> violations,
            String traceId
    ) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                status, detail);
        problem.setType(URI.create(
                "urn:hamcheeze:problem:"
                        + code.toLowerCase(Locale.ROOT)
                        .replace('_', '-')));
        problem.setTitle(title(status));
        problem.setInstance(instance);
        problem.setProperty("code", code);
        problem.setProperty("replayed", replayed);
        problem.setProperty("retryable", false);
        problem.setProperty("traceId", traceId);
        if (!violations.isEmpty()) {
            problem.setProperty("violations", violations);
        }
        return problem;
    }

    private static String title(HttpStatus status) {
        return switch (status) {
            case BAD_REQUEST -> "Invalid request";
            case NOT_FOUND -> "Task resource not found";
            case CONFLICT -> "Task request conflict";
            case UNPROCESSABLE_ENTITY -> "Task validation failed";
            default -> status.getReasonPhrase();
        };
    }
}
