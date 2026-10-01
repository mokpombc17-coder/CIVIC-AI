package ai.civic.mainauth.auth;

import java.time.Instant;

public class ChallengeSendLimitException extends RuntimeException {
    private final String code;
    private final Instant retryAt;

    public ChallengeSendLimitException(String code, Instant retryAt) {
        super("Authentication code cannot be sent again yet");
        this.code = code;
        this.retryAt = retryAt;
    }

    public String code() {
        return code;
    }

    public Instant retryAt() {
        return retryAt;
    }
}
