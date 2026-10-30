package com.hamcheeze.vote.task.application.prediction;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Objects;

public final class TaskPredictionTransactionCallbacks {

    private static final Logger LOGGER = LoggerFactory.getLogger(
            TaskPredictionTransactionCallbacks.class);

    private TaskPredictionTransactionCallbacks() {
    }

    static void afterCommit(Runnable action) {
        afterCommit("task-prediction-metric", action);
    }

    public static void afterCommit(String operation, Runnable action) {
        String safeOperation = requireOperation(operation);
        Objects.requireNonNull(action, "action");
        if (TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager
                .isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            runBestEffort(safeOperation, action);
                        }
                    });
            return;
        }
        runBestEffort(safeOperation, action);
    }

    private static void runBestEffort(
            String operation,
            Runnable action
    ) {
        try {
            action.run();
        } catch (RuntimeException exception) {
            LOGGER.warn(
                    "Task after-commit callback failed: operation={}, exceptionType={}",
                    operation,
                    exception.getClass().getName());
        }
    }

    private static String requireOperation(String operation) {
        if (operation == null || operation.isBlank()) {
            throw new IllegalArgumentException(
                    "operation must not be blank");
        }
        return operation.trim();
    }
}
