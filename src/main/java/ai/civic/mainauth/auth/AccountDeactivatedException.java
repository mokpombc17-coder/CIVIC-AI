package ai.civic.mainauth.auth;

// Raised only after the password matched, so the account state is disclosed to its owner alone.
public class AccountDeactivatedException extends RuntimeException {
    public AccountDeactivatedException() {
        super("The account is deactivated");
    }
}
