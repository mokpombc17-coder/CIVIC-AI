package com.hamcheeze.vote.survey.infra.persona;

import com.hamcheeze.vote.persona.application.PersonaSurveySource;
import com.hamcheeze.vote.persona.application.PersonaSurveySourceException;
import com.hamcheeze.vote.persona.application.port.out.PersonaSurveySourceQueryPort;
import com.hamcheeze.vote.persona.domain.common.PersonaSourceId;
import com.hamcheeze.vote.survey.application.port.out.SurveyContentVersionRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.response.SurveyResponse;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;

@Component
public class PersonaSurveySourceQueryAdapter
        implements PersonaSurveySourceQueryPort {

    private final SurveyResponseRepository responses;
    private final SurveyRoundRepository rounds;
    private final SurveyContentVersionRepository contents;
    private final PersonaSurveySourceMapper mapper;

    public PersonaSurveySourceQueryAdapter(
            SurveyResponseRepository responses,
            SurveyRoundRepository rounds,
            SurveyContentVersionRepository contents,
            PersonaSurveySourceMapper mapper
    ) {
        this.responses = Objects.requireNonNull(responses, "responses");
        this.rounds = Objects.requireNonNull(rounds, "rounds");
        this.contents = Objects.requireNonNull(contents, "contents");
        this.mapper = Objects.requireNonNull(mapper, "mapper");
    }

    @Override
    @Transactional(readOnly = true)
    public PersonaSurveySource getByResponseId(
            PersonaSourceId sourceId
    ) {
        Objects.requireNonNull(sourceId, "sourceId");
        SurveyResponseId responseId = new SurveyResponseId(sourceId.value());
        SurveyResponse response = responses.findById(responseId)
                .orElseThrow(() ->
                        PersonaSurveySourceException.notFound(sourceId));
        SurveyRound round = rounds.findById(response.roundId())
                .orElseThrow(() -> integrity(
                        responseId, "referenced round does not exist"));
        SurveyContentVersion content = contents
                .findById(response.contentVersionId())
                .orElseThrow(() -> integrity(
                        responseId,
                        "referenced content version does not exist"));
        return mapper.map(response, round, content);
    }

    private static PersonaSurveySourceException integrity(
            SurveyResponseId responseId,
            String detail
    ) {
        return PersonaSurveySourceException.integrityViolation(
                new PersonaSourceId(responseId.value()), detail);
    }
}
