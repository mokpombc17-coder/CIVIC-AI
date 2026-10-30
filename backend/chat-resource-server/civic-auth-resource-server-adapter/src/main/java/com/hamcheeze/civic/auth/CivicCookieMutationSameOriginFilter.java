package com.hamcheeze.civic.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.net.URI;
import java.util.Objects;
import java.util.Set;

public final class CivicCookieMutationSameOriginFilter
        extends OncePerRequestFilter {

    private static final String SEC_FETCH_SITE = "Sec-Fetch-Site";
    private static final Set<String> SAFE_METHODS =
            Set.of("GET", "HEAD", "OPTIONS", "TRACE");

    private final String browserOrigin;
    private final AccessDeniedHandler accessDeniedHandler;

    public CivicCookieMutationSameOriginFilter(
            URI browserOrigin,
            AccessDeniedHandler accessDeniedHandler
    ) {
        Objects.requireNonNull(browserOrigin, "browserOrigin");
        this.browserOrigin = browserOrigin.getScheme()
                + "://"
                + browserOrigin.getRawAuthority();
        this.accessDeniedHandler = Objects.requireNonNull(
                accessDeniedHandler,
                "accessDeniedHandler");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        if (SAFE_METHODS.contains(request.getMethod())
                || !containsAccessTokenCookie(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        if (!browserOrigin.equals(request.getHeader(HttpHeaders.ORIGIN))
                || !"same-origin".equals(
                request.getHeader(SEC_FETCH_SITE))) {
            accessDeniedHandler.handle(
                    request,
                    response,
                    new AccessDeniedException(
                            "Cookie-authenticated mutation rejected"));
            return;
        }
        filterChain.doFilter(request, response);
    }

    private static boolean containsAccessTokenCookie(
            HttpServletRequest request
    ) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return false;
        }
        for (Cookie cookie : cookies) {
            if (CivicAuthContract.ACCESS_TOKEN_COOKIE.equals(
                    cookie.getName())) {
                return true;
            }
        }
        return false;
    }
}
