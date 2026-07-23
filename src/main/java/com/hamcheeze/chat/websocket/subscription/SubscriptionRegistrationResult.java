package com.hamcheeze.chat.websocket.subscription;

public record SubscriptionRegistrationResult(
        boolean registered,
        SubscriptionRejectedCode rejectionCode
) {
    public static SubscriptionRegistrationResult accepted() {
        return new SubscriptionRegistrationResult(true, null);
    }

    public static SubscriptionRegistrationResult rejected(
            SubscriptionRejectedCode code
    ) {
        return new SubscriptionRegistrationResult(false, code);
    }
}
