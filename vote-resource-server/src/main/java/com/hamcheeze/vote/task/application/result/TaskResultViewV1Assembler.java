package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.result.TaskResultViewV1.OptionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.QuestionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.ResponseData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.TaskData;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.submission.TaskSubmission;
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
    private static final Comparator<TaskSubmission> SUBMISSION_ORDER =
            Comparator.comparing(TaskSubmission::submittedAt)
                    .thenComparing(submission -> submission.id().value());

    public TaskResultViewV1 assemble(
            Task task,
            List<TaskSubmission> submissions,
            int resultVersion
    ) {
        Objects.requireNonNull(task, "task");
        Objects.requireNonNull(submissions, "submissions");
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

        List<TaskSubmission> orderedSubmissions = new ArrayList<>(submissions);
        orderedSubmissions.sort(SUBMISSION_ORDER);
        validateSubmissions(task, question, orderedSubmissions);

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
                responseData(orderedSubmissions, optionOrders));
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

    private static void validateSubmissions(
            Task task,
            TaskQuestion question,
            List<TaskSubmission> submissions
    ) {
        Set<TaskSubmissionId> submissionIds = new HashSet<>();
        for (TaskSubmission submission : submissions) {
            Objects.requireNonNull(submission, "submission");
            if (!task.id().equals(submission.taskId())) {
                throw new IllegalArgumentException(
                        "all submissions must belong to task");
            }
            if (!question.id().equals(submission.questionId())) {
                throw new IllegalArgumentException(
                        "all submissions must answer the task question");
            }
            if (!submissionIds.add(submission.id())) {
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
            List<TaskSubmission> submissions,
            Map<TaskOptionId, Integer> optionOrders
    ) {
        List<ResponseData> responses = new ArrayList<>(submissions.size());
        for (int index = 0; index < submissions.size(); index++) {
            TaskSubmission submission = submissions.get(index);
            Integer selectedOptionOrder = optionOrders.get(
                    submission.selectedOptionId());
            if (selectedOptionOrder == null) {
                throw new IllegalArgumentException(
                        "submission selected option must belong to task");
            }
            responses.add(new ResponseData(
                    index + 1,
                    selectedOptionOrder,
                    submission.finalReason(),
                    submission.reasonSource(),
                    submission.submittedAt()));
        }
        return List.copyOf(responses);
    }
}
