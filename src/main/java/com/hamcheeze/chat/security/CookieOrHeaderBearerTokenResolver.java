package com.hamcheeze.chat.security;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.server.resource.BearerTokenErrors;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;

import java.util.Objects;

public final class CookieOrHeaderBearerTokenResolver
        implements BearerTokenResolver {

    public static final String COOKIE_NAME = "civic_ai_access_token";

    private final DefaultBearerTokenResolver headerResolver =
            new DefaultBearerTokenResolver();
    private final boolean cookieAuthenticationEnabled;

    public CookieOrHeaderBearerTokenResolver(
            boolean cookieAuthenticationEnabled
    ) {
        this.cookieAuthenticationEnabled = cookieAuthenticationEnabled;
    }

    @Override
    public String resolve(HttpServletRequest request) {
        String headerToken = headerResolver.resolve(request);
        String cookieToken = cookieAuthenticationEnabled
                ? resolveCookie(request)
                : null;

        if (headerToken != null
                && cookieToken != null
                && !Objects.equals(headerToken, cookieToken)) {
            throw new OAuth2AuthenticationException(
                    BearerTokenErrors.invalidRequest(
                            "Authorization header and authentication "
                                    + "cookie contain different tokens"));
        }
        return headerToken != null ? headerToken : cookieToken;
    }

    private static String resolveCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }

        String token = null;
        for (Cookie cookie : cookies) {
            if (!COOKIE_NAME.equals(cookie.getName())
                    || cookie.getValue() == null
                    || cookie.getValue().isBlank()) {
                continue;
            }
            if (token != null && !Objects.equals(token, cookie.getValue())) {
                throw new OAuth2AuthenticationException(
                        BearerTokenErrors.invalidRequest(
                                "Multiple authentication cookies contain "
                                        + "different tokens"));
            }
            token = cookie.getValue();
        }
        return token;
    }
}
