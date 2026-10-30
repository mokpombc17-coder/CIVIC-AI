package com.hamcheeze.civic.auth;

import org.junit.jupiter.api.Test;

import java.net.URI;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CivicAuthPropertiesTest {

    @Test
    void requiresHttpsTrustedEndpoints() {
        CivicAuthProperties properties =
                CivicJwtDecoderContractTest.properties();
        properties.setJwksUri(URI.create(
                "http://issuer.example/.well-known/jwks.json"));

        assertThatThrownBy(properties::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("trusted HTTPS URI");
    }

    @Test
    void rejectsHttpLoopbackWithoutExplicitOptIn() {
        CivicAuthProperties properties =
                CivicJwtDecoderContractTest.properties();
        properties.setIssuer(URI.create("http://localhost:8080"));

        assertThatThrownBy(properties::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("HTTP loopback URI");
    }

    @Test
    void allowsExplicitHttpLoopbackEndpointsForLocalDevelopment() {
        CivicAuthProperties properties =
                CivicJwtDecoderContractTest.properties();
        properties.setAllowInsecureLoopback(true);
        properties.setIssuer(URI.create("http://localhost:8080"));
        properties.setJwksUri(URI.create(
                "http://127.0.0.1:8080/.well-known/jwks.json"));
        properties.setBrowserOrigin(URI.create("http://[::1]:8080"));

        assertThatCode(properties::validate).doesNotThrowAnyException();
    }

    @Test
    void rejectsNonLoopbackHttpEndpointWhenOptedIn() {
        CivicAuthProperties properties =
                CivicJwtDecoderContractTest.properties();
        properties.setAllowInsecureLoopback(true);
        properties.setIssuer(URI.create("http://issuer.example"));

        assertThatThrownBy(properties::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("HTTP loopback URI");
    }

    @Test
    void rejectsLookalikeLoopbackHostWhenOptedIn() {
        CivicAuthProperties properties =
                CivicJwtDecoderContractTest.properties();
        properties.setAllowInsecureLoopback(true);
        properties.setIssuer(URI.create("http://localhost.example:8080"));

        assertThatThrownBy(properties::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("HTTP loopback URI");
    }

    @Test
    void rejectsLoopbackOptInForProductionProfile() {
        CivicAuthProperties properties =
                CivicJwtDecoderContractTest.properties();
        properties.setAllowInsecureLoopback(true);

        assertThatThrownBy(() -> properties.validate(true))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("prod profile");
    }

    @Test
    void rejectsJwksCacheLongerThanContract() {
        CivicAuthProperties properties =
                CivicJwtDecoderContractTest.properties();
        properties.setJwksCacheTtl(Duration.ofSeconds(301));

        assertThatThrownBy(properties::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("at most 300 seconds");
    }

    @Test
    void requiresOriginWithoutPathOrQuery() {
        CivicAuthProperties properties =
                CivicJwtDecoderContractTest.properties();
        properties.setBrowserOrigin(URI.create(
                "https://app.example/untrusted-path"));

        assertThatThrownBy(properties::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("scheme and authority");
    }
}
