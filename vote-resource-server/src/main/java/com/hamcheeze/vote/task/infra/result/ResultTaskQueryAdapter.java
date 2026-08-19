package com.hamcheeze.vote.task.infra.result;

import com.hamcheeze.vote.result.application.port.out.ResultTaskQueryPort;
import com.hamcheeze.vote.result.application.port.out.ResultTaskQueryPort.AnswerType;
import com.hamcheeze.vote.result.application.port.out.ResultTaskQueryPort.Option;
import com.hamcheeze.vote.result.application.port.out.ResultTaskQueryPort.OptionKind;
import com.hamcheeze.vote.result.application.port.out.ResultTaskQueryPort.Question;
import com.hamcheeze.vote.result.application.port.out.ResultTaskQueryPort.ResultTask;
import com.hamcheeze.vote.result.application.port.out.ResultTaskQueryPort.Status;
import com.hamcheeze.vote.task.application.port.out.TaskRepository;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Component
public class ResultTaskQueryAdapter implements ResultTaskQueryPort {

    private final TaskRepository tasks;

    public ResultTaskQueryAdapter(TaskRepository tasks) {
        this.tasks = Objects.requireNonNull(tasks, "tasks");
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ResultTask> findByTaskId(UUID taskId) {
        Objects.requireNonNull(taskId, "taskId");
        return tasks.findById(new TaskId(taskId)).map(this::map);
    }

    private ResultTask map(Task task) {
        return new ResultTask(
                task.id().value(),
                task.title(),
                task.description(),
                Status.valueOf(task.status().name()),
                task.openedAt(),
                task.closedAt(),
                task.questions().stream().map(this::map).toList());
    }

    private Question map(TaskQuestion question) {
        return new Question(
                question.id().value(),
                question.displayOrder(),
                AnswerType.valueOf(question.type().name()),
                question.content(),
                question.description(),
                question.options().stream().map(this::map).toList());
    }

    private Option map(TaskOption option) {
        return new Option(
                option.id().value(),
                option.displayOrder(),
                OptionKind.valueOf(option.kind().name()),
                option.content());
    }
}
