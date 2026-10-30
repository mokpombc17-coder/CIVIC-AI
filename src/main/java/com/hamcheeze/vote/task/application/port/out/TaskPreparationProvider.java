package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.preparation.TaskPreparationCommand;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationProviderResult;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationRemoteStatus;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationVerification;

public interface TaskPreparationProvider {

    TaskPreparationProviderResult prepare(TaskPreparationCommand command);

    TaskPreparationRemoteStatus findStatus(
            TaskPreparationVerification verification);
}
