package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.result.TaskResultViewV1.OptionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.QuestionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.ResponseData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.TaskData;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.task.Task;
import com.hamcheeze.vote.task.domain.task.TaskOption;
import com.hamcheeze.vote.task.domain.task.TaskQuestion;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Builds the consumer-neutral task-result-view/v1 read model. */
@Component
public class TaskResultViewV1Assembler {

    private static final Comparator<TaskOption> OPTION_ORDER =
            Comparator.comparingInt(TaskOption::displayOrder)
                    .thenComparing(option -> option.id().value());
    private static final Comparator<TaskResultResponse> RESPONSE_ORDER =
            Comparator.comparing(TaskResultResponse::submittedAt)
                    .thenComparing(response -> response.submissionId().value());

    public TaskResultViewV1 assemble(
            Task task,
            List<TaskResultResponse> responses,
            int resultVersion
    ) {
        Objects.requireNonNull(task, "task");
        Objects.requireNonNull(responses, "responses");
        if (!task.resultEligible()) {
            throw new IllegalArgumentException(
                    "task must have a finalized result");
        }
        if (task.questions().size() != 1) {
            throw new IllegalArgumentException(
                    "task-result-view/v1 requires exactly one question");
        }

        TaskQuestion question = task.questions().getFirst();
        List<TaskOption> orderedOptions = new ArrayList<>(
                question.options());
        orderedOptions.sort(OPTION_ORDER);
        Map<TaskOptionId, Integer> optionOrders = optionOrders(orderedOptions);

        List<TaskResultResponse> orderedResponses = new ArrayList<>(responses);
        orderedResponses.sort(RESPONSE_ORDER);
        validateResponses(task, question, orderedResponses);

        return new TaskResultViewV1(
                resultVersion,
                task.closedAt(),
                task.closureType(),
                new TaskData(task.title(), task.description()),
                new QuestionData(
                        question.type(),
                        question.content(),
                        question.description()),
                optionData(orderedOptions),
                responseData(orderedResponses, optionOrders));
    }

    private static Map<TaskOptionId, Integer> optionOrders(
            List<TaskOption> options
    ) {
        Map<TaskOptionId, Integer> orders = new HashMap<>();
        for (TaskOption option : options) {
            Integer previous = orders.put(
                    option.id(), option.displayOrder());
            if (previous != null) {
                throw new IllegalArgumentException(
                        "task result contains duplicate optionId");
            }
        }
        return orders;
    }

    private static void validateResponses(
            Task task,
            TaskQuestion question,
            List<TaskResultResponse> responses
    ) {
        Set<TaskSubmissionId> submissionIds = new HashSet<>();
        for (TaskResultResponse response : responses) {
            Objects.requireNonNull(response, "response");
            if (!task.id().equals(response.taskId())) {
                throw new IllegalArgumentException(
                        "all submissions must belong to task");
            }
            if (!question.id().equals(response.questionId())) {
                throw new IllegalArgumentException(
                        "all submissions must answer the task question");
            }
            if (!submissionIds.add(response.submissionId())) {
                throw new IllegalArgumentException(
                        "task result contains duplicate submissionId");
            }
        }
    }

    private static List<OptionData> optionData(List<TaskOption> options) {
        return options.stream()
                .map(option -> new OptionData(
                        option.displayOrder(), option.content()))
                .toList();
    }

    private static List<ResponseData> responseData(
            List<TaskResultResponse> resultResponses,
            Map<TaskOptionId, Integer> optionOrders
    ) {
        List<ResponseData> responses = new ArrayList<>(
                resultResponses.size());
        for (int index = 0; index < resultResponses.size(); index++) {
            TaskResultResponse response = resultResponses.get(index);
            Integer selectedOptionOrder = optionOrders.get(
                    response.selectedOptionId());
            if (selectedOptionOrder == null) {
                throw new IllegalArgumentException(
                        "submission selected option must belong to task");
            }
            responses.add(new ResponseData(
                    index + 1,
                    selectedOptionOrder,
                    response.finalReason(),
                    response.reasonSource(),
                    response.submittedAt()));
        }
        return List.copyOf(responses);
    }
}
