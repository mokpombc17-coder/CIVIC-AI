package ai.civic.mainauth.auth;

public class PasswordResetAccountException extends RuntimeException {
    private final boolean deactivated;

    private PasswordResetAccountException(String message, boolean deactivated) {
        super(message);
        this.deactivated = deactivated;
    }

    static PasswordResetAccountException forUnknownAccount() {
        return new PasswordResetAccountException("No account is registered with this email", false);
    }

    static PasswordResetAccountException forDeactivatedAccount() {
        return new PasswordResetAccountException("The account is deactivated", true);
    }

    public boolean deactivated() {
        return deactivated;
    }

    public String code() {
        return deactivated ? "PASSWORD_RESET_ACCOUNT_DEACTIVATED" : "PASSWORD_RESET_ACCOUNT_NOT_FOUND";
    }
}
