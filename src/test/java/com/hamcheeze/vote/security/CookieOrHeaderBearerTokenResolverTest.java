package com.hamcheeze.vote.security;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CookieOrHeaderBearerTokenResolverTest {

    @Test
    void resolvesCookieWhenCookieAuthenticationIsEnabled() {
        CookieOrHeaderBearerTokenResolver resolver =
                new CookieOrHeaderBearerTokenResolver(true);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(authenticationCookie("cookie-token"));

        assertThat(resolver.resolve(request)).isEqualTo("cookie-token");
    }

    @Test
    void ignoresCookieWhenCookieAuthenticationIsDisabled() {
        CookieOrHeaderBearerTokenResolver resolver =
                new CookieOrHeaderBearerTokenResolver(false);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(authenticationCookie("cookie-token"));

        assertThat(resolver.resolve(request)).isNull();
    }

    @Test
    void resolvesAuthorizationBearerHeader() {
        CookieOrHeaderBearerTokenResolver resolver =
                new CookieOrHeaderBearerTokenResolver(true);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(
                HttpHeaders.AUTHORIZATION,
                "Bearer header-token");

        assertThat(resolver.resolve(request)).isEqualTo("header-token");
    }

    @Test
    void acceptsMatchingHeaderAndCookieTokens() {
        CookieOrHeaderBearerTokenResolver resolver =
                new CookieOrHeaderBearerTokenResolver(true);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(
                HttpHeaders.AUTHORIZATION,
                "Bearer same-token");
        request.setCookies(authenticationCookie("same-token"));

        assertThat(resolver.resolve(request)).isEqualTo("same-token");
    }

    @Test
    void rejectsDifferentHeaderAndCookieTokens() {
        CookieOrHeaderBearerTokenResolver resolver =
                new CookieOrHeaderBearerTokenResolver(true);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(
                HttpHeaders.AUTHORIZATION,
                "Bearer header-token");
        request.setCookies(authenticationCookie("cookie-token"));

        assertThatThrownBy(() -> resolver.resolve(request))
                .isInstanceOf(OAuth2AuthenticationException.class);
    }

    @Test
    void rejectsDifferentAuthenticationCookieValues() {
        CookieOrHeaderBearerTokenResolver resolver =
                new CookieOrHeaderBearerTokenResolver(true);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(
                authenticationCookie("first-token"),
                authenticationCookie("second-token"));

        assertThatThrownBy(() -> resolver.resolve(request))
                .isInstanceOf(OAuth2AuthenticationException.class);
    }

    @Test
    void ignoresNullAndBlankAuthenticationCookies() {
        CookieOrHeaderBearerTokenResolver resolver =
                new CookieOrHeaderBearerTokenResolver(true);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(
                authenticationCookie(null),
                authenticationCookie(" "));

        assertThat(resolver.resolve(request)).isNull();
    }

    private Cookie authenticationCookie(String value) {
        return new Cookie(
                CookieOrHeaderBearerTokenResolver.COOKIE_NAME,
                value);
    }
}
