package com.hamcheeze.civic.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.net.URI;
import java.time.Duration;
import java.util.Objects;

@ConfigurationProperties("civic.auth")
public class CivicAuthProperties {

    private URI issuer;
    private URI jwksUri;
    private URI browserOrigin;
    private boolean allowInsecureLoopback;
    private Duration jwksCacheTtl = Duration.ofSeconds(300);
    private Duration unknownKidRefreshInterval = Duration.ofSeconds(1);
    private int unknownKidCacheSize = 1_024;
    private Duration httpConnectTimeout = Duration.ofSeconds(3);
    private Duration httpRequestTimeout = Duration.ofSeconds(3);
    private int maxTokenBytes = 8_192;
    private int maxKidLength = 128;
    private int maxJwksBytes = 65_536;
    private int maxJwksKeys = 16;

    public URI getIssuer() {
        return issuer;
    }

    public void setIssuer(URI issuer) {
        this.issuer = issuer;
    }

    public URI getJwksUri() {
        return jwksUri;
    }

    public void setJwksUri(URI jwksUri) {
        this.jwksUri = jwksUri;
    }

    public URI getBrowserOrigin() {
        return browserOrigin;
    }

    public void setBrowserOrigin(URI browserOrigin) {
        this.browserOrigin = browserOrigin;
    }

    public boolean isAllowInsecureLoopback() {
        return allowInsecureLoopback;
    }

    public void setAllowInsecureLoopback(boolean allowInsecureLoopback) {
        this.allowInsecureLoopback = allowInsecureLoopback;
    }

    public Duration getJwksCacheTtl() {
        return jwksCacheTtl;
    }

    public void setJwksCacheTtl(Duration jwksCacheTtl) {
        this.jwksCacheTtl = jwksCacheTtl;
    }

    public Duration getUnknownKidRefreshInterval() {
        return unknownKidRefreshInterval;
    }

    public void setUnknownKidRefreshInterval(
            Duration unknownKidRefreshInterval
    ) {
        this.unknownKidRefreshInterval = unknownKidRefreshInterval;
    }

    public int getUnknownKidCacheSize() {
        return unknownKidCacheSize;
    }

    public void setUnknownKidCacheSize(int unknownKidCacheSize) {
        this.unknownKidCacheSize = unknownKidCacheSize;
    }

    public Duration getHttpConnectTimeout() {
        return httpConnectTimeout;
    }

    public void setHttpConnectTimeout(Duration httpConnectTimeout) {
        this.httpConnectTimeout = httpConnectTimeout;
    }

    public Duration getHttpRequestTimeout() {
        return httpRequestTimeout;
    }

    public void setHttpRequestTimeout(Duration httpRequestTimeout) {
        this.httpRequestTimeout = httpRequestTimeout;
    }

    public int getMaxTokenBytes() {
        return maxTokenBytes;
    }

    public void setMaxTokenBytes(int maxTokenBytes) {
        this.maxTokenBytes = maxTokenBytes;
    }

    public int getMaxKidLength() {
        return maxKidLength;
    }

    public void setMaxKidLength(int maxKidLength) {
        this.maxKidLength = maxKidLength;
    }

    public int getMaxJwksBytes() {
        return maxJwksBytes;
    }

    public void setMaxJwksBytes(int maxJwksBytes) {
        this.maxJwksBytes = maxJwksBytes;
    }

    public int getMaxJwksKeys() {
        return maxJwksKeys;
    }

    public void setMaxJwksKeys(int maxJwksKeys) {
        this.maxJwksKeys = maxJwksKeys;
    }

    void validate() {
        validateEndpoint("issuer", issuer);
        validateEndpoint("jwks-uri", jwksUri);
        validateOrigin(browserOrigin);
        requirePositive("jwks-cache-ttl", jwksCacheTtl);
        if (jwksCacheTtl.compareTo(Duration.ofSeconds(300)) > 0) {
            throw invalid("jwks-cache-ttl must be at most 300 seconds");
        }
        requirePositive(
                "unknown-kid-refresh-interval",
                unknownKidRefreshInterval);
        requirePositive("http-connect-timeout", httpConnectTimeout);
        requirePositive("http-request-timeout", httpRequestTimeout);
        requirePositive("unknown-kid-cache-size", unknownKidCacheSize);
        requirePositive("max-token-bytes", maxTokenBytes);
        requirePositive("max-kid-length", maxKidLength);
        requirePositive("max-jwks-bytes", maxJwksBytes);
        requirePositive("max-jwks-keys", maxJwksKeys);
    }

    void validate(boolean productionProfileActive) {
        if (productionProfileActive && allowInsecureLoopback) {
            throw invalid("allow-insecure-loopback must be false when the "
                    + "prod profile is active");
        }
        validate();
    }

    private void validateEndpoint(String name, URI value) {
        Objects.requireNonNull(value, "civic.auth." + name + " is required");
        boolean trustedScheme = "https".equalsIgnoreCase(value.getScheme())
                || isAllowedHttpLoopback(value);
        if (!trustedScheme
                || value.getHost() == null
                || value.getUserInfo() != null
                || value.getFragment() != null) {
            throw invalid(name + " must be a trusted HTTPS URI or an "
                    + "explicitly allowed HTTP loopback URI");
        }
    }

    private void validateOrigin(URI value) {
        validateEndpoint("browser-origin", value);
        String path = value.getPath();
        if ((path != null && !path.isEmpty() && !"/".equals(path))
                || value.getQuery() != null) {
            throw invalid("browser-origin must contain only scheme and authority");
        }
    }

    private boolean isAllowedHttpLoopback(URI value) {
        return allowInsecureLoopback
                && "http".equalsIgnoreCase(value.getScheme())
                && isExplicitLoopbackHost(value.getHost());
    }

    private static boolean isExplicitLoopbackHost(String host) {
        return "localhost".equalsIgnoreCase(host)
                || "127.0.0.1".equals(host)
                || "::1".equals(host)
                || "[::1]".equals(host);
    }

    private static void requirePositive(String name, Duration value) {
        Objects.requireNonNull(value, "civic.auth." + name + " is required");
        if (value.isZero() || value.isNegative()) {
            throw invalid(name + " must be positive");
        }
    }

    private static void requirePositive(String name, int value) {
        if (value <= 0) {
            throw invalid(name + " must be positive");
        }
    }

    private static IllegalStateException invalid(String message) {
        return new IllegalStateException("Invalid civic.auth configuration: "
                + message);
    }
}
