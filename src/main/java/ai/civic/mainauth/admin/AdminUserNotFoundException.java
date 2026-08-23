package ai.civic.mainauth.admin;

public class AdminUserNotFoundException extends RuntimeException {
    public AdminUserNotFoundException() {
        super("Administrator user was not found");
    }
}
