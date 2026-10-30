package com.hamcheeze.vote.task.application.bootstrap;

public final class LocalTaskBootstrapException extends RuntimeException {

    public static final String CODE = "LOCAL_TASK_BOOTSTRAP_CONFLICT";

    public LocalTaskBootstrapException(String detail) {
        super(CODE + ": " + detail);
    }
}
