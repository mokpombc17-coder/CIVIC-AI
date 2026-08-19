package com.hamcheeze.vote.opinionmap.infra.persistence;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.opinionmap.application.port.out.OpinionMapSubmissionProjectionRepository;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapReasonSource;
import com.hamcheeze.vote.opinionmap.domain.OpinionMapSubmissionProjection;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles({"local", "test"})
@Transactional
class OpinionMapSubmissionProjectionJdbcAdapterIntegrationTest {

    @Autowired
    private OpinionMapSubmissionProjectionRepository submissions;

    @Test
    void storesImmutableSingleChoiceReasonProjection() {
        OpinionMapSubmissionProjection submission = new OpinionMapSubmissionProjection(
                uuid(1), "user-a", uuid(2), uuid(3), uuid(4), uuid(5),
                uuid(6), uuid(7), OpinionMapReasonSource.AI_ACCEPTED, uuid(8),
                "채택 당시 예상 이유",
                Instant.parse("2026-08-19T00:00:00.123456789Z"));

        assertThat(submissions.insertIfAbsent(submission)).isTrue();
        assertThat(submissions.insertIfAbsent(submission)).isFalse();
        assertThat(submissions.findBySubmissionId(
                submission.submissionId())).contains(submission);
    }

    private static UUID uuid(long suffix) {
        return UUID.fromString(
                "13110000-0000-0000-0000-%012d".formatted(suffix));
    }
}
