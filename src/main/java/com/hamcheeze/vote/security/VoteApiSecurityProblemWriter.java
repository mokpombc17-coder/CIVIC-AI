package com.hamcheeze.vote.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.util.Objects;

public final class VoteApiSecurityProblemWriter
        implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final ObjectMapper objectMapper;

    public VoteApiSecurityProblemWriter(ObjectMapper objectMapper) {
        this.objectMapper =
                Objects.requireNonNull(objectMapper, "objectMapper");
    }

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException exception
    ) throws IOException {
        write(
                request,
                response,
                HttpStatus.UNAUTHORIZED,
                VoteApiErrorCode.UNAUTHENTICATED,
                "Authentication required",
                "A valid Bearer token is required.");
    }

    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException exception
    ) throws IOException {
        write(
                request,
                response,
                HttpStatus.FORBIDDEN,
                VoteApiErrorCode.ACCESS_DENIED,
                "Access denied",
                "Access to this resource is denied.");
    }

    private void write(
            HttpServletRequest request,
            HttpServletResponse response,
            HttpStatus status,
            VoteApiErrorCode code,
            String title,
            String detail
    ) throws IOException {
        ProblemDetail problem = VoteProblemDetails.create(
                status,
                code,
                title,
                detail,
                URI.create(request.getRequestURI()),
                VoteRequestTraceId.resolve(request));
        response.setStatus(status.value());
        response.setContentType(
                MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(), problem);
    }
}
