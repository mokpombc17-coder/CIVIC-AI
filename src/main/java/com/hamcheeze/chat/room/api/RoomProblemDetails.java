package com.hamcheeze.chat.room.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

import java.net.URI;
import java.util.Locale;

public final class RoomProblemDetails {

    private RoomProblemDetails() {
    }

    public static ProblemDetail create(
            HttpStatus status,
            String code,
            String title,
            String detail,
            String clientRequestId,
            boolean replayed,
            boolean retryable,
            URI instance
    ) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                status,
                detail);
        problem.setType(URI.create(
                "urn:hamcheeze:problem:"
                        + code.toLowerCase(Locale.ROOT)
                        .replace('_', '-')));
        problem.setTitle(title);
        problem.setInstance(instance);
        problem.setProperty("code", code);
        if (clientRequestId != null) {
            problem.setProperty(
                    "clientRequestId",
                    clientRequestId);
        }
        problem.setProperty("replayed", replayed);
        problem.setProperty("retryable", retryable);
        return problem;
    }
}
