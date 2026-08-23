package ai.civic.mainauth.privacy;

public class PrivacyOperationNotFoundException extends RuntimeException {
    public PrivacyOperationNotFoundException() {
        super("Privacy operation does not exist");
    }
}
