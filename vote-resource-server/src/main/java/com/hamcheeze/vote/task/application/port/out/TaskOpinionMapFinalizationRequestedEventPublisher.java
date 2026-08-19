package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.task.TaskClosureFact;

public interface TaskOpinionMapFinalizationRequestedEventPublisher {

    void publish(
            TaskClosureFact closureFact,
            int expectedSubmissionCount);
}
