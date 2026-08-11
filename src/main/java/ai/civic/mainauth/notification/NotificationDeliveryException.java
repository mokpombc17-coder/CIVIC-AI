package ai.civic.mainauth.notification;

public final class NotificationDeliveryException extends RuntimeException {
    public NotificationDeliveryException() {
        super("Verification email could not be delivered; request a resend");
    }
}
