package ai.civic.mainauth.token;

import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public final class Es256KeyRing {
    private final ECKey active;
    private final List<ECKey> retiring;

    public Es256KeyRing(ECKey active, List<ECKey> retiring) {
        if (active == null || active.getKeyID() == null || !active.isPrivate()) {
            throw new IllegalArgumentException("Active ES256 key must contain private material and kid");
        }
        this.active = active;
        this.retiring = List.copyOf(retiring);
    }

    @Autowired
    public Es256KeyRing(@Value("${civic.es256.key-directory:}") String directory) {
        var loaded = loadKeys(directory);
        if (loaded.isEmpty()) {
            try {
                this.active = new ECKeyGenerator(Curve.P_256).keyID("local-ephemeral").generate();
                this.retiring = List.of();
            } catch (Exception exception) {
                throw new IllegalStateException("Could not create local ES256 key", exception);
            }
        } else {
            this.active = loaded.getLast();
            this.retiring = List.copyOf(loaded.subList(0, loaded.size() - 1));
        }
    }

    public ECKey active() {
        return active;
    }

    public JWKSet publicJwks() {
        var keys = new ArrayList<com.nimbusds.jose.jwk.JWK>();
        retiring.forEach(key -> keys.add(key.toPublicJWK()));
        keys.add(active.toPublicJWK());
        return new JWKSet(keys);
    }

    private List<ECKey> loadKeys(String directory) {
        if (directory == null || directory.isBlank()) return List.of();
        try (var files = Files.list(Path.of(directory))) {
            return files.filter(path -> path.getFileName().toString().endsWith(".json"))
                    .sorted(Comparator.comparing(Path::toString))
                    .map(path -> {
                        try {
                            var key = ECKey.parse(Files.readString(path));
                            if (!Curve.P_256.equals(key.getCurve()) || !key.isPrivate()) {
                                throw new IllegalStateException("ES256 key file must contain a private P-256 key: " + path);
                            }
                            return key;
                        } catch (Exception exception) {
                            throw new IllegalStateException("Could not load ES256 key file: " + path, exception);
                        }
                    }).toList();
        } catch (Exception exception) {
            throw new IllegalStateException("Could not read CIVIC_ES256_KEY_DIRECTORY", exception);
        }
    }
}
