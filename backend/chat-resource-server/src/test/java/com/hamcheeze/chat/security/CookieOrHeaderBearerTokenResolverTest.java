package com.hamcheeze.chat.security;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CookieOrHeaderBearerTokenResolverTest {

    @Test
    void resolvesCookieWhenLocalCookieAuthenticationIsEnabled() {
        CookieOrHeaderBearerTokenResolver resolver =
                new CookieOrHeaderBearerTokenResolver(true);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie(
                CookieOrHeaderBearerTokenResolver.COOKIE_NAME,
                "cookie-token"));

        assertThat(resolver.resolve(request)).isEqualTo("cookie-token");
    }

    @Test
    void ignoresCookieWhenCookieAuthenticationIsDisabled() {
        CookieOrHeaderBearerTokenResolver resolver =
                new CookieOrHeaderBearerTokenResolver(false);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie(
                CookieOrHeaderBearerTokenResolver.COOKIE_NAME,
                "cookie-token"));

        assertThat(resolver.resolve(request)).isNull();
    }

    @Test
    void keepsAuthorizationBearerFallback() {
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
        request.setCookies(new Cookie(
                CookieOrHeaderBearerTokenResolver.COOKIE_NAME,
                "same-token"));

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
        request.setCookies(new Cookie(
                CookieOrHeaderBearerTokenResolver.COOKIE_NAME,
                "cookie-token"));

        assertThatThrownBy(() -> resolver.resolve(request))
                .isInstanceOf(OAuth2AuthenticationException.class);
    }
}
