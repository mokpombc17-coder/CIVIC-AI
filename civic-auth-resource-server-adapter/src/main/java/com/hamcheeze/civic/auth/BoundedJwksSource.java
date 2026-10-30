package com.hamcheeze.civic.auth;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.KeySourceException;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSelector;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyType;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.SecurityContext;

import java.io.IOException;
import java.text.ParseException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class BoundedJwksSource implements JWKSource<SecurityContext> {

    private final Object monitor = new Object();
    private final JwksDocumentLoader loader;
    private final Clock clock;
    private final Duration cacheTtl;
    private final Duration unknownKidRefreshInterval;
    private final int unknownKidCacheSize;
    private final int maxKeys;
    private final int maxKidLength;
    private final LinkedHashMap<String, Instant> unknownKidRefreshes =
            new LinkedHashMap<>();

    private Snapshot snapshot = Snapshot.empty();
    private Instant lastRefreshAttempt = Instant.MIN;

    BoundedJwksSource(
            JwksDocumentLoader loader,
            Clock clock,
            Duration cacheTtl,
            Duration unknownKidRefreshInterval,
            int unknownKidCacheSize,
            int maxKeys,
            int maxKidLength
    ) {
        this.loader = loader;
        this.clock = clock;
        this.cacheTtl = cacheTtl;
        this.unknownKidRefreshInterval = unknownKidRefreshInterval;
        this.unknownKidCacheSize = unknownKidCacheSize;
        this.maxKeys = maxKeys;
        this.maxKidLength = maxKidLength;
    }

    @Override
    public List<JWK> get(
            JWKSelector selector,
            SecurityContext context
    ) throws KeySourceException {
        synchronized (monitor) {
            Instant now = clock.instant();
            pruneUnknownKids(now);
            if (!snapshot.isFresh(now)) {
                if (refreshIntervalActive(now)) {
                    throw new KeySourceException(
                            "JWKS refresh is temporarily throttled");
                }
                refresh(now);
            }

            List<JWK> selected = selector.select(snapshot.jwkSet());
            if (!selected.isEmpty()) {
                return selected;
            }

            String unknownKid = singleRequestedKid(selector);
            if (unknownKid == null
                    || unknownKidRefreshes.containsKey(unknownKid)
                    || refreshIntervalActive(now)) {
                return List.of();
            }

            rememberUnknownKid(unknownKid, now);
            refresh(now);
            return selector.select(snapshot.jwkSet());
        }
    }

    private void refresh(Instant now) throws KeySourceException {
        lastRefreshAttempt = now;
        try {
            JWKSet candidate = JWKSet.parse(loader.load());
            validate(candidate);
            snapshot = new Snapshot(candidate, now.plus(cacheTtl));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new KeySourceException("JWKS refresh interrupted", exception);
        } catch (IOException | ParseException | IllegalArgumentException exception) {
            throw new KeySourceException("Unable to refresh trusted JWKS", exception);
        }
    }

    private void validate(JWKSet candidate) {
        List<JWK> keys = candidate.getKeys();
        if (keys.isEmpty() || keys.size() > maxKeys) {
            throw invalidJwks();
        }
        Set<String> kids = new HashSet<>();
        for (JWK key : keys) {
            String kid = key.getKeyID();
            if (!KeyType.RSA.equals(key.getKeyType())
                    || !KeyUse.SIGNATURE.equals(key.getKeyUse())
                    || !JWSAlgorithm.RS256.equals(key.getAlgorithm())
                    || key.isPrivate()
                    || key.size() < 2_048
                    || kid == null
                    || kid.isBlank()
                    || kid.length() > maxKidLength
                    || !kids.add(kid)) {
                throw invalidJwks();
            }
        }
    }

    private boolean refreshIntervalActive(Instant now) {
        if (lastRefreshAttempt.equals(Instant.MIN)) {
            return false;
        }
        return now.isBefore(lastRefreshAttempt.plus(
                unknownKidRefreshInterval));
    }

    private static String singleRequestedKid(JWKSelector selector) {
        Set<String> keyIds = selector.getMatcher().getKeyIDs();
        if (keyIds == null || keyIds.size() != 1) {
            return null;
        }
        return keyIds.iterator().next();
    }

    private void rememberUnknownKid(String kid, Instant now) {
        unknownKidRefreshes.put(kid, now);
        while (unknownKidRefreshes.size() > unknownKidCacheSize) {
            String eldest = unknownKidRefreshes.keySet().iterator().next();
            unknownKidRefreshes.remove(eldest);
        }
    }

    private void pruneUnknownKids(Instant now) {
        unknownKidRefreshes.entrySet().removeIf(entry ->
                !entry.getValue().plus(cacheTtl).isAfter(now));
    }

    private static IllegalArgumentException invalidJwks() {
        return new IllegalArgumentException(
                "JWKS does not satisfy the CIVIC key contract");
    }

    private record Snapshot(JWKSet jwkSet, Instant expiresAt) {

        static Snapshot empty() {
            return new Snapshot(new JWKSet(), Instant.MIN);
        }

        boolean isFresh(Instant now) {
            return now.isBefore(expiresAt);
        }
    }
}
