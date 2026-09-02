package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.preparation.TaskPreparationCommand;
import com.hamcheeze.vote.task.application.preparation.TaskPreparationProviderResult;

public interface TaskPreparationProvider {

    TaskPreparationProviderResult prepare(TaskPreparationCommand command);
}
