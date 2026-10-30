package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.idempotency.TaskAdminCreationReceipt;
import com.hamcheeze.vote.task.application.idempotency.TaskIdempotencyKey;
import com.hamcheeze.vote.task.domain.common.TaskActorId;

import java.util.Optional;

public interface TaskAdminCreationReceiptRepository {

    boolean claim(TaskAdminCreationReceipt receipt);

    Optional<TaskAdminCreationReceipt> findByRequest(
            TaskActorId actorId,
            TaskIdempotencyKey idempotencyKey);
}
