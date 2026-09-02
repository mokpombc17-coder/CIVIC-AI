package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.preparation.TaskPreparationCommand;
import com.hamcheeze.vote.task.domain.task.Task;

import java.util.UUID;

public interface TaskPreparationPayloadFactory {

    TaskPreparationCommand create(Task task, UUID requestId);

    String fingerprint(Task task);
}
