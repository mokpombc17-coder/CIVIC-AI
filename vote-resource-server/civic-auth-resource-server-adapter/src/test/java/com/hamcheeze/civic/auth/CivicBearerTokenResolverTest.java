package com.hamcheeze.civic.auth;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CivicBearerTokenResolverTest {

    private final CivicBearerTokenResolver resolver =
            new CivicBearerTokenResolver();

    @Test
    void resolvesOneCookieOrOneBearerHeader() {
        MockHttpServletRequest cookieRequest = requestWithCookie("cookie-token");
        MockHttpServletRequest headerRequest = new MockHttpServletRequest();
        headerRequest.addHeader("Authorization", "Bearer header-token");

        assertThat(resolver.resolve(cookieRequest)).isEqualTo("cookie-token");
        assertThat(resolver.resolve(headerRequest)).isEqualTo("header-token");
    }

    @Test
    void acceptsMatchingHeaderAndCookie() {
        MockHttpServletRequest request = requestWithCookie("same-token");
        request.addHeader("Authorization", "Bearer same-token");

        assertThat(resolver.resolve(request)).isEqualTo("same-token");
    }

    @Test
    void rejectsDifferentHeaderAndCookie() {
        MockHttpServletRequest request = requestWithCookie("cookie-token");
        request.addHeader("Authorization", "Bearer header-token");

        assertThatThrownBy(() -> resolver.resolve(request))
                .isInstanceOf(OAuth2AuthenticationException.class);
    }

    @Test
    void rejectsDuplicateCookiesEvenWhenValuesMatch() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(
                cookie("same-token"),
                cookie("same-token"));

        assertThatThrownBy(() -> resolver.resolve(request))
                .isInstanceOf(OAuth2AuthenticationException.class);
    }

    @Test
    void rejectsBlankCookieAlongsideValidBearer() {
        MockHttpServletRequest request = requestWithCookie(" ");
        request.addHeader("Authorization", "Bearer header-token");

        assertThatThrownBy(() -> resolver.resolve(request))
                .isInstanceOf(OAuth2AuthenticationException.class);
    }

    @Test
    void rejectsMultipleOrMalformedAuthorizationHeaders() {
        MockHttpServletRequest duplicates = new MockHttpServletRequest();
        duplicates.addHeader("Authorization", "Bearer first");
        duplicates.addHeader("Authorization", "Bearer second");
        MockHttpServletRequest malformed = requestWithCookie("cookie-token");
        malformed.addHeader("Authorization", "Basic value");

        assertThatThrownBy(() -> resolver.resolve(duplicates))
                .isInstanceOf(OAuth2AuthenticationException.class);
        assertThatThrownBy(() -> resolver.resolve(malformed))
                .isInstanceOf(OAuth2AuthenticationException.class);
    }

    private static MockHttpServletRequest requestWithCookie(String value) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(cookie(value));
        return request;
    }

    private static Cookie cookie(String value) {
        return new Cookie(CivicAuthContract.ACCESS_TOKEN_COOKIE, value);
    }
}
