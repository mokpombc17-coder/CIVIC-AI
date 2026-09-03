package com.hamcheeze.vote.task.infra.persistence;

import com.hamcheeze.vote.task.application.port.out.TaskProgressSummaryReader.OptionSubmissionCount;
import com.hamcheeze.vote.task.domain.common.TaskId;
import com.hamcheeze.vote.task.domain.common.TaskOptionId;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TaskProgressSummaryJdbcAdapterTest {

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Test
    @SuppressWarnings("unchecked")
    void queriesOnlyAggregateOptionCounts() {
        TaskId taskId = new TaskId(UUID.randomUUID());
        OptionSubmissionCount count = new OptionSubmissionCount(
                new TaskOptionId(UUID.randomUUID()), 3);
        when(jdbcTemplate.query(
                anyString(), any(RowMapper.class), eq(taskId.value())))
                .thenReturn(List.of(count));
        TaskProgressSummaryJdbcAdapter adapter =
                new TaskProgressSummaryJdbcAdapter(jdbcTemplate);

        assertThat(adapter.countSelections(taskId)).containsExactly(count);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).query(
                sql.capture(), any(RowMapper.class), eq(taskId.value()));
        assertThat(sql.getValue())
                .contains("selected_option_id", "COUNT(*)", "GROUP BY")
                .doesNotContain("user_id", "persona", "final_reason",
                        "submitted_at");
    }
}
