package com.hamcheeze.vote.task.infra.bootstrap;

public class LocalTaskPersonaBootstrapException extends RuntimeException {

    public LocalTaskPersonaBootstrapException(String message) {
        super(message);
    }

    public LocalTaskPersonaBootstrapException(
            String message,
            Throwable cause
    ) {
        super(message, cause);
    }
}
