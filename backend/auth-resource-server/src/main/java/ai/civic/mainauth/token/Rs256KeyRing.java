package ai.civic.mainauth.token;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public final class Rs256KeyRing {
    private final RSAKey active;
    private final List<RSAKey> retiring;

    public Rs256KeyRing(RSAKey active, List<RSAKey> retiring) {
        validateKeys(active, retiring);
        this.active = active;
        this.retiring = List.copyOf(retiring);
    }

    @Autowired
    public Rs256KeyRing(@Value("${civic.rs256.key-directory:}") String directory) {
        var loaded = loadKeys(directory);
        if (loaded.isEmpty()) {
            try {
                this.active = new RSAKeyGenerator(2048).keyID("local-ephemeral").generate();
                this.retiring = List.of();
            } catch (Exception exception) {
                throw new IllegalStateException("Could not create local RS256 key", exception);
            }
        } else {
            this.active = loaded.getLast();
            this.retiring = List.copyOf(loaded.subList(0, loaded.size() - 1));
        }
        validateKeys(this.active, this.retiring);
    }

    public RSAKey active() {
        return active;
    }

    public RSAKey verificationKey(String keyId) {
        if (keyId == null || keyId.isBlank()) return null;
        if (keyId.equals(active.getKeyID())) return active.toPublicJWK();
        return retiring.stream()
                .filter(key -> keyId.equals(key.getKeyID()))
                .findFirst()
                .map(RSAKey::toPublicJWK)
                .orElse(null);
    }

    public JWKSet publicJwks() {
        var keys = new ArrayList<com.nimbusds.jose.jwk.JWK>();
        retiring.forEach(key -> keys.add(publicSigningKey(key)));
        keys.add(publicSigningKey(active));
        return new JWKSet(keys);
    }

    private RSAKey publicSigningKey(RSAKey key) {
        return new RSAKey.Builder(key.getModulus(), key.getPublicExponent())
                .keyID(key.getKeyID())
                .keyUse(KeyUse.SIGNATURE)
                .algorithm(JWSAlgorithm.RS256)
                .build();
    }

    private List<RSAKey> loadKeys(String directory) {
        if (directory == null || directory.isBlank()) return List.of();
        try (var files = Files.list(Path.of(directory))) {
            return files.filter(path -> path.getFileName().toString().endsWith(".json"))
                    .sorted(Comparator.comparing(Path::toString))
                    .map(path -> {
                        try {
                            var key = RSAKey.parse(Files.readString(path));
                            if (key.size() < 2048 || !key.isPrivate()) {
                                throw new IllegalStateException(
                                        "RS256 key file must contain a private RSA key of at least 2048 bits: " + path);
                            }
                            return key;
                        } catch (Exception exception) {
                            throw new IllegalStateException("Could not load RS256 key file: " + path, exception);
                        }
                    }).toList();
        } catch (Exception exception) {
            throw new IllegalStateException("Could not read CIVIC_RS256_KEY_DIRECTORY", exception);
        }
    }

    private static void validateKeys(RSAKey active, List<RSAKey> retiring) {
        if (active == null || retiring == null) {
            throw new IllegalArgumentException("RS256 key ring is required");
        }
        var keyIds = new HashSet<String>();
        validateKey(active, "Active", keyIds);
        retiring.forEach(key -> validateKey(key, "Retiring", keyIds));
    }

    private static void validateKey(RSAKey key, String kind, HashSet<String> keyIds) {
        if (key == null || key.getKeyID() == null || key.getKeyID().isBlank()
                || !key.isPrivate() || key.size() < 2048) {
            throw new IllegalArgumentException(
                    kind + " RS256 key must contain at least 2048-bit private material and a non-empty kid");
        }
        if (!keyIds.add(key.getKeyID())) {
            throw new IllegalArgumentException("RS256 key IDs must be unique");
        }
    }
}
