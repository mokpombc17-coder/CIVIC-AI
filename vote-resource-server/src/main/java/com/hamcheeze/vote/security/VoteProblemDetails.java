package com.hamcheeze.vote.security;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;

import java.net.URI;
import java.util.Locale;

final class VoteProblemDetails {

    private VoteProblemDetails() {
    }

    static ProblemDetail create(
            HttpStatus status,
            VoteApiErrorCode code,
            String title,
            String detail,
            URI instance
    ) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                status,
                detail);
        problem.setType(URI.create(
                "urn:hamcheeze:problem:"
                        + code.name().toLowerCase(Locale.ROOT)
                        .replace('_', '-')));
        problem.setTitle(title);
        problem.setInstance(instance);
        problem.setProperty("code", code.name());
        problem.setProperty("replayed", false);
        problem.setProperty("retryable", false);
        return problem;
    }
}
