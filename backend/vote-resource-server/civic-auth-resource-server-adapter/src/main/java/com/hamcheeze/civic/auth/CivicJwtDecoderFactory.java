package com.hamcheeze.civic.auth;

import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.SecurityContext;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

import java.time.Clock;

final class CivicJwtDecoderFactory {

    private CivicJwtDecoderFactory() {
    }

    static JwtDecoder create(CivicAuthProperties properties) {
        properties.validate();
        JwksDocumentLoader loader = new HttpsJwksDocumentLoader(
                properties.getJwksUri(),
                properties.getHttpConnectTimeout(),
                properties.getHttpRequestTimeout(),
                properties.getMaxJwksBytes());
        return create(properties, loader, Clock.systemUTC());
    }

    static JwtDecoder create(
            CivicAuthProperties properties,
            JwksDocumentLoader loader,
            Clock clock
    ) {
        JWKSource<SecurityContext> jwkSource = new BoundedJwksSource(
                loader,
                clock,
                properties.getJwksCacheTtl(),
                properties.getUnknownKidRefreshInterval(),
                properties.getUnknownKidCacheSize(),
                properties.getMaxJwksKeys(),
                properties.getMaxKidLength());
        NimbusJwtDecoder delegate = NimbusJwtDecoder
                .withJwkSource(jwkSource)
                .jwsAlgorithm(SignatureAlgorithm.RS256)
                .build();
        delegate.setJwtValidator(new CivicAccessTokenValidator(
                properties.getIssuer().toString(),
                clock));
        return new CivicJwtDecoder(
                new CompactJwtContractValidator(
                        properties.getMaxTokenBytes(),
                        properties.getMaxKidLength()),
                delegate,
                clock);
    }
}
