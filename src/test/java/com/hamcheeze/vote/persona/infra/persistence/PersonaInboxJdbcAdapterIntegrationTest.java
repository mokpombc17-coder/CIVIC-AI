package com.hamcheeze.vote.persona.infra.persistence;

import com.hamcheeze.vote.TestcontainersConfiguration;
import com.hamcheeze.vote.persona.application.integration.PersonaInboxReceipt;
import com.hamcheeze.vote.persona.application.port.out.PersonaInboxRepository;
import com.hamcheeze.vote.shared.integration.survey.SurveyResponseSubmittedV1;
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
class PersonaInboxJdbcAdapterIntegrationTest {

    private static final Instant NOW =
            Instant.parse("2026-08-18T00:00:00Z");

    @Autowired
    private PersonaInboxRepository inbox;

    @Test
    void recordsEachEventOncePerConsumer() {
        UUID eventId = UUID.randomUUID();
        PersonaInboxReceipt receipt = new PersonaInboxReceipt(
                "persona-generation",
                eventId,
                SurveyResponseSubmittedV1.EVENT_TYPE,
                NOW);

        assertThat(inbox.recordIfAbsent(receipt)).isTrue();
        assertThat(inbox.recordIfAbsent(receipt)).isFalse();
        assertThat(inbox.exists("persona-generation", eventId)).isTrue();

        assertThat(inbox.recordIfAbsent(new PersonaInboxReceipt(
                "persona-audit",
                eventId,
                SurveyResponseSubmittedV1.EVENT_TYPE,
                NOW))).isTrue();
    }
}
