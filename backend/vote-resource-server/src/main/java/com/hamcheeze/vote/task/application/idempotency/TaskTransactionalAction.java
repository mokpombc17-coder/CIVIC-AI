package com.hamcheeze.vote.task.application.idempotency;

@FunctionalInterface
public interface TaskTransactionalAction<T> {

    T execute();
}
