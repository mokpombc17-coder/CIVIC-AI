package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.result.TaskResultForLlmV1.OptionData;
import com.hamcheeze.vote.task.application.result.TaskResultForLlmV1.ResponseData;
import com.hamcheeze.vote.task.domain.common.TaskId;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Objects;

@Component
public class TaskResultForLlmV1Assembler {

    public TaskResultForLlmV1 assemble(
            TaskId taskId,
            VerifiedTaskResultView verified
    ) {
        Objects.requireNonNull(taskId, "taskId");
        Objects.requireNonNull(verified, "verified");
        if (!taskId.equals(verified.manifest().taskId())) {
            throw new IllegalArgumentException(
                    "taskId must match the verified result manifest");
        }
        TaskResultViewV1 view = verified.view();
        return new TaskResultForLlmV1(
                taskId,
                verified.manifest().schemaVersion(),
                verified.manifest().resultVersion(),
                verified.manifest().bodySha256(),
                view.task(),
                view.question(),
                view.options().stream()
                        .map(option -> new OptionData(
                                optionKey(option.displayOrder()),
                                option.displayOrder(),
                                option.content()))
                        .toList(),
                view.responses().stream()
                        .map(response -> new ResponseData(
                                responseRef(response.participantSequence()),
                                optionKey(
                                        response.selectedOptionDisplayOrder()),
                                response.reason()))
                        .toList());
    }

    private static String optionKey(int displayOrder) {
        return "O" + displayOrder;
    }

    private static String responseRef(int participantSequence) {
        return "R" + participantSequence;
    }
}
