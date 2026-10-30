package com.hamcheeze.civic.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.net.URI;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;

class CivicCookieMutationSameOriginFilterTest {

    private AtomicBoolean rejected;
    private CivicCookieMutationSameOriginFilter filter;

    @BeforeEach
    void setUp() {
        rejected = new AtomicBoolean();
        filter = new CivicCookieMutationSameOriginFilter(
                URI.create("https://app.example"),
                (request, response, exception) -> {
                    rejected.set(true);
                    response.setStatus(403);
                });
    }

    @Test
    void allowsExactSameOriginCookieMutation() throws Exception {
        MockHttpServletRequest request = cookieRequest("POST");
        request.addHeader("Origin", "https://app.example");
        request.addHeader("Sec-Fetch-Site", "same-origin");
        AtomicBoolean continued = new AtomicBoolean();

        filter.doFilter(
                request,
                new MockHttpServletResponse(),
                continuingChain(continued));

        assertThat(continued).isTrue();
        assertThat(rejected).isFalse();
    }

    @Test
    void rejectsMissingOrCrossSiteHeadersForCookieMutation()
            throws Exception {
        MockHttpServletRequest request = cookieRequest("PUT");
        request.addHeader("Origin", "https://evil.example");
        request.addHeader("Sec-Fetch-Site", "cross-site");
        AtomicBoolean continued = new AtomicBoolean();

        filter.doFilter(
                request,
                new MockHttpServletResponse(),
                continuingChain(continued));

        assertThat(rejected).isTrue();
        assertThat(continued).isFalse();
    }

    @Test
    void allowsSafeCookieRequestsAndBearerOnlyMutations() throws Exception {
        AtomicBoolean getContinued = new AtomicBoolean();
        filter.doFilter(
                cookieRequest("GET"),
                new MockHttpServletResponse(),
                continuingChain(getContinued));

        MockHttpServletRequest bearerOnly = new MockHttpServletRequest(
                "PATCH",
                "/api/v1/resource");
        bearerOnly.addHeader("Authorization", "Bearer token");
        AtomicBoolean patchContinued = new AtomicBoolean();
        filter.doFilter(
                bearerOnly,
                new MockHttpServletResponse(),
                continuingChain(patchContinued));

        assertThat(getContinued).isTrue();
        assertThat(patchContinued).isTrue();
        assertThat(rejected).isFalse();
    }

    private static MockHttpServletRequest cookieRequest(String method) {
        MockHttpServletRequest request = new MockHttpServletRequest(
                method,
                "/api/v1/resource");
        request.setCookies(new Cookie(
                CivicAuthContract.ACCESS_TOKEN_COOKIE,
                "token"));
        return request;
    }

    private static FilterChain continuingChain(AtomicBoolean continued) {
        return (request, response) -> continued.set(true);
    }
}
