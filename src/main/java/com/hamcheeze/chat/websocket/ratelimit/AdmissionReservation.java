package com.hamcheeze.chat.websocket.ratelimit;

public interface AdmissionReservation extends AutoCloseable {

    AdmissionOutcome outcome();

    default boolean granted() {
        return outcome() == AdmissionOutcome.GRANTED;
    }

    long retryAfterMs();

    void commit();

    @Override
    void close();
}
