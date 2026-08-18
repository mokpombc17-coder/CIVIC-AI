package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyKey;
import com.hamcheeze.vote.task.application.idempotency.TaskSubmissionReceipt;
import com.hamcheeze.vote.task.domain.common.TaskUserId;

import java.util.Optional;

public interface TaskSubmissionReceiptRepository {

    Optional<TaskSubmissionReceipt> findByRequestForUpdate(
            TaskUserId userId,
            TaskIdempotencyKey idempotencyKey);

    Optional<TaskSubmissionReceipt> findByRequest(
            TaskUserId userId,
            TaskIdempotencyKey idempotencyKey);

    void insertProcessing(TaskSubmissionReceipt receipt);

    void updateCompleted(TaskSubmissionReceipt receipt);
}
