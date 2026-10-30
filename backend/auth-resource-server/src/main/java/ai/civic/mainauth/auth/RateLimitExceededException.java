package ai.civic.mainauth.auth;

public class RateLimitExceededException extends RuntimeException {
    public RateLimitExceededException() {
        super("Too many pre-session requests; retry later");
    }
}
