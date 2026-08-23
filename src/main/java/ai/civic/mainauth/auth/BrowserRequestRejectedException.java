package ai.civic.mainauth.auth;

public class BrowserRequestRejectedException extends RuntimeException {
    public BrowserRequestRejectedException(String message) {
        super(message);
    }
}
