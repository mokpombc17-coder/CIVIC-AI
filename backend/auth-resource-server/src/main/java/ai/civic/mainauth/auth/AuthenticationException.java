package ai.civic.mainauth.auth;

public class AuthenticationException extends RuntimeException {
    private final String code;

    public AuthenticationException(String message) {
        this(message, null);
    }

    public AuthenticationException(String message, String code) {
        super(message);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
