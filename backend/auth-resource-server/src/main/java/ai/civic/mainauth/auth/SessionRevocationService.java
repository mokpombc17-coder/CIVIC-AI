package ai.civic.mainauth.auth;

import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SessionRevocationService {
    private final RefreshTokenService browserRefreshTokens;
    private final PwaRefreshTokenService pwaRefreshTokens;

    public SessionRevocationService(
            RefreshTokenService browserRefreshTokens,
            PwaRefreshTokenService pwaRefreshTokens) {
        this.browserRefreshTokens = browserRefreshTokens;
        this.pwaRefreshTokens = pwaRefreshTokens;
    }

    @Transactional
    public void revokeAll(UUID userId, String reason) {
        browserRefreshTokens.revokeAll(userId, reason);
        pwaRefreshTokens.revokeAll(userId, reason);
    }
}
