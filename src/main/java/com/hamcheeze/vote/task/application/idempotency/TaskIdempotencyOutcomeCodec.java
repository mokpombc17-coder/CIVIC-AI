package com.hamcheeze.vote.task.application.idempotency;

public interface TaskIdempotencyOutcomeCodec<T> {

    StoredTaskSubmissionOutcome encode(T result);

    T decode(StoredTaskSubmissionOutcome storedOutcome);
}
