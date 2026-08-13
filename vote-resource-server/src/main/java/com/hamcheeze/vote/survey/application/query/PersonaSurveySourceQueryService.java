package com.hamcheeze.vote.survey.application.query;

import com.hamcheeze.vote.survey.application.persona.PersonaSurveySource;
import com.hamcheeze.vote.survey.application.persona.PersonaSurveySourceAssembler;
import com.hamcheeze.vote.survey.application.persona.PersonaSurveySourceException;
import com.hamcheeze.vote.survey.application.port.in.PersonaSurveySourceQueryPort;
import com.hamcheeze.vote.survey.application.port.out.SurveyContentVersionRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyResponseRepository;
import com.hamcheeze.vote.survey.application.port.out.SurveyRoundRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.response.SurveyResponse;
import com.hamcheeze.vote.survey.domain.round.SurveyRound;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;

@Service
public class PersonaSurveySourceQueryService
        implements PersonaSurveySourceQueryPort {

    private final SurveyResponseRepository responses;
    private final SurveyRoundRepository rounds;
    private final SurveyContentVersionRepository contents;
    private final PersonaSurveySourceAssembler assembler;

    public PersonaSurveySourceQueryService(
            SurveyResponseRepository responses,
            SurveyRoundRepository rounds,
            SurveyContentVersionRepository contents,
            PersonaSurveySourceAssembler assembler
    ) {
        this.responses = Objects.requireNonNull(responses, "responses");
        this.rounds = Objects.requireNonNull(rounds, "rounds");
        this.contents = Objects.requireNonNull(contents, "contents");
        this.assembler = Objects.requireNonNull(assembler, "assembler");
    }

    @Override
    @Transactional(readOnly = true)
    public PersonaSurveySource getByResponseId(
            SurveyResponseId responseId
    ) {
        Objects.requireNonNull(responseId, "responseId");
        SurveyResponse response = responses.findById(responseId)
                .orElseThrow(() ->
                        PersonaSurveySourceException.notFound(responseId));
        SurveyRound round = rounds.findById(response.roundId())
                .orElseThrow(() -> integrity(
                        responseId, "referenced round does not exist"));
        SurveyContentVersion content = contents
                .findById(response.contentVersionId())
                .orElseThrow(() -> integrity(
                        responseId,
                        "referenced content version does not exist"));
        return assembler.assemble(response, round, content);
    }

    private static PersonaSurveySourceException integrity(
            SurveyResponseId responseId,
            String detail
    ) {
        return PersonaSurveySourceException.integrityViolation(
                responseId, detail);
    }
}
