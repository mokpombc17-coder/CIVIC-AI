package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.domain.submission.TaskSubmission;

public interface TaskSubmissionCompletedEventPublisher {

    void publish(TaskSubmission submission);
}
