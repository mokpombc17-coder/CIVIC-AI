package ai.civic.mainauth.auth;

public class PasswordResetAccountException extends RuntimeException {
    public PasswordResetAccountException() {
        super("No account is registered with this email");
    }

    public String code() {
        return "PASSWORD_RESET_ACCOUNT_NOT_FOUND";
    }
}
