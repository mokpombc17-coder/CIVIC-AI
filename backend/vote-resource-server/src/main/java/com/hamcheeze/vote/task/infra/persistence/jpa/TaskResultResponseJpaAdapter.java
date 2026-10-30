package com.hamcheeze.vote.task.infra.persistence.jpa;

import com.hamcheeze.vote.task.application.port.out.TaskResultResponseReader;
import com.hamcheeze.vote.task.application.result.TaskResultResponse;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskQuestionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Repository
public class TaskResultResponseJpaAdapter
        implements TaskResultResponseReader {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional(readOnly = true)
    public List<TaskResultResponse> findByTaskId(TaskId taskId) {
        Objects.requireNonNull(taskId, "taskId");
        return entityManager.createQuery(
                        """
                        SELECT submission.id,
                               submission.taskId,
                               submission.questionId,
                               submission.selectedOptionId,
                               submission.finalReason,
                               submission.reasonSource
                        FROM TaskSubmissionJpaEntity submission
                        WHERE submission.taskId = :taskId
                        ORDER BY submission.id
                        """, Object[].class)
                .setParameter("taskId", taskId.value())
                .getResultList().stream()
                .map(TaskResultResponseJpaAdapter::toResultResponse)
                .toList();
    }

    private static TaskResultResponse toResultResponse(
            Object[] row
    ) {
        return new TaskResultResponse(
                new TaskSubmissionId((UUID) row[0]),
                new TaskId((UUID) row[1]),
                new TaskQuestionId((UUID) row[2]),
                new TaskOptionId((UUID) row[3]),
                (String) row[4],
                (TaskReasonSource) row[5]);
    }
}
