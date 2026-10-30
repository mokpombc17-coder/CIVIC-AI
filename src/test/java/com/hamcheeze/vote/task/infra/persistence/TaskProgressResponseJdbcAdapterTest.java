package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.task.application.port.out.TaskProgressResponseReader.SubmissionRow;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import com.hamcheeze.vote.task.domain.common.TaskSubmissionId;
import com.hamcheeze.vote.task.domain.submission.TaskReasonSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TaskProgressResponseJdbcAdapterTest {

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Test
    @SuppressWarnings("unchecked")
    void queriesOnlyAnonymousResponseFieldsInStableOrder() {
        TaskId taskId = new TaskId(UUID.randomUUID());
        SubmissionRow row = new SubmissionRow(
                new TaskSubmissionId(UUID.randomUUID()),
                new TaskOptionId(UUID.randomUUID()),
                TaskReasonSource.USER_WRITTEN,
                "직접 작성한 이유",
                Instant.parse("2026-09-03T01:00:00Z"));
        when(jdbcTemplate.query(
                anyString(), any(RowMapper.class),
                eq(taskId.value()), eq(11)))
                .thenReturn(List.of(row));
        TaskProgressResponseJdbcAdapter adapter =
                new TaskProgressResponseJdbcAdapter(jdbcTemplate);

        assertThat(adapter.findByTask(taskId, Optional.empty(), 11))
                .containsExactly(row);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).query(
                sql.capture(), any(RowMapper.class),
                eq(taskId.value()), eq(11));
        assertThat(sql.getValue())
                .contains("submission_id", "selected_option_id",
                        "reason_source", "final_reason", "submitted_at",
                        "ORDER BY submitted_at ASC, submission_id ASC")
                .doesNotContain("user_id", "persona", "prediction_id",
                        "accepted_predicted_reason_id");
    }
}
