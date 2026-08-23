package ai.civic.mainauth.token;

import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DiscoveryController {
    private final Es256KeyRing keys;
    private final String issuer;

    public DiscoveryController(
            Es256KeyRing keys,
            @Value("${civic.issuer:https://localhost}") String issuer) {
        this.keys = keys;
        this.issuer = issuer;
    }

    @GetMapping("/.well-known/openid-configuration")
    Map<String, String> configuration() {
        return Map.of("issuer", issuer, "jwks_uri", issuer + "/.well-known/jwks.json");
    }

    @GetMapping("/.well-known/jwks.json")
    ResponseEntity<Map<String, Object>> jwks() {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(java.time.Duration.ofMinutes(5)).cachePublic())
                .body(keys.publicJwks().toJSONObject());
    }
}
