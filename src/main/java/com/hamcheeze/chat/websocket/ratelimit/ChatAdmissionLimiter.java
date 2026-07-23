package com.hamcheeze.chat.websocket.ratelimit;

public interface ChatAdmissionLimiter {

    AdmissionReservation tryReserve(String userId, int tokenCost);
}
