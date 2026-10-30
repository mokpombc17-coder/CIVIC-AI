package com.hamcheeze.civic.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.server.resource.BearerTokenErrors;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;

import java.util.Collections;
import java.util.List;
import java.util.Objects;

public final class CivicBearerTokenResolver implements BearerTokenResolver {

    private final DefaultBearerTokenResolver headerResolver =
            new DefaultBearerTokenResolver();

    @Override
    public String resolve(HttpServletRequest request) {
        List<String> authorizationHeaders = Collections.list(
                request.getHeaders(HttpHeaders.AUTHORIZATION));
        if (authorizationHeaders.size() > 1) {
            throw invalidRequest();
        }

        String headerToken = headerResolver.resolve(request);
        if (!authorizationHeaders.isEmpty() && headerToken == null) {
            throw invalidRequest();
        }
        String cookieToken = resolveCookie(request);
        if (headerToken != null
                && cookieToken != null
                && !Objects.equals(headerToken, cookieToken)) {
            throw invalidRequest();
        }
        return headerToken != null ? headerToken : cookieToken;
    }

    private static String resolveCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        String token = null;
        int count = 0;
        for (Cookie cookie : cookies) {
            if (!CivicAuthContract.ACCESS_TOKEN_COOKIE.equals(
                    cookie.getName())) {
                continue;
            }
            count++;
            token = cookie.getValue();
        }
        if (count > 1 || (count == 1 && (token == null || token.isBlank()))) {
            throw invalidRequest();
        }
        return token;
    }

    private static OAuth2AuthenticationException invalidRequest() {
        return new OAuth2AuthenticationException(
                BearerTokenErrors.invalidRequest(
                        "Invalid access-token credentials"));
    }
}
