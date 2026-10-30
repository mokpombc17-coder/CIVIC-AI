package com.hamcheeze.vote.task.application.idempotency;

public enum TaskSubmissionReceiptStatus {
    PROCESSING,
    SUCCEEDED,
    REJECTED
}
