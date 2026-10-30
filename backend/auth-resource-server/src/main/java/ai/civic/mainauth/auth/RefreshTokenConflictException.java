package ai.civic.mainauth.auth;

public final class RefreshTokenConflictException extends RuntimeException {
    public RefreshTokenConflictException() {
        super("Refresh token rotation is already in progress");
    }
}
