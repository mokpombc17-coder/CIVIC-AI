package com.hamcheeze.vote.task.infra.prediction;

import com.hamcheeze.vote.persona.application.CurrentPersonaStatus;
import com.hamcheeze.vote.persona.application.query.CurrentPersonaQueryService;
import com.hamcheeze.vote.persona.domain.PersonaId;
import com.hamcheeze.vote.persona.domain.common.PersonaGenerationId;
import com.hamcheeze.vote.task.application.port.out.CurrentTaskPersonaQueryPort.CurrentTaskPersona;
import com.hamcheeze.vote.task.domain.common.TaskUserId;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PersonaCurrentTaskPersonaQueryAdapterTest {

    @Test
    void mapsOnlyReadyCurrentPersonaIntoTaskIdentity() {
        CurrentPersonaQueryService query =
                mock(CurrentPersonaQueryService.class);
        UUID generationId = UUID.randomUUID();
        when(query.findCurrent(any())).thenReturn(new CurrentPersonaStatus(
                Optional.empty(),
                Optional.of(new PersonaGenerationId(generationId)),
                CurrentPersonaStatus.Status.SUCCEEDED,
                Optional.of(new PersonaId("persona-external")),
                Optional.empty(),
                true,
                Set.of()));
        PersonaCurrentTaskPersonaQueryAdapter adapter =
                new PersonaCurrentTaskPersonaQueryAdapter(query);

        Optional<CurrentTaskPersona> result = adapter.findCurrentUsable(
                new TaskUserId("user-a"));

        assertThat(result).get().satisfies(persona -> {
            assertThat(persona.generationId().value())
                    .isEqualTo(generationId);
            assertThat(persona.personaId().value())
                    .isEqualTo("persona-external");
        });
    }

    @Test
    void hidesPendingPersona() {
        CurrentPersonaQueryService query =
                mock(CurrentPersonaQueryService.class);
        when(query.findCurrent(any())).thenReturn(
                CurrentPersonaStatus.notSubmitted());

        assertThat(new PersonaCurrentTaskPersonaQueryAdapter(query)
                .findCurrentUsable(new TaskUserId("user-a")))
                .isEmpty();
    }
}
