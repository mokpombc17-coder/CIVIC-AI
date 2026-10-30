package com.hamcheeze.vote.survey.application.query;

import com.hamcheeze.vote.survey.application.port.out.SurveyResponseRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyResponseId;
import com.hamcheeze.vote.survey.domain.common.SurveyUserId;
import com.hamcheeze.vote.survey.domain.response.SurveyResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
public class MySurveyResponseQueryService {

    private final SurveyResponseRepository responses;

    public MySurveyResponseQueryService(
            SurveyResponseRepository responses
    ) {
        this.responses = Objects.requireNonNull(responses, "responses");
    }

    @Transactional(readOnly = true)
    public Optional<SurveyResponse> findLatest(SurveyUserId userId) {
        return responses.findLatestByUserId(
                Objects.requireNonNull(userId, "userId"));
    }

    @Transactional(readOnly = true)
    public List<SurveyResponse> findHistory(SurveyUserId userId) {
        return responses.findAllByUserId(
                Objects.requireNonNull(userId, "userId"));
    }

    @Transactional(readOnly = true)
    public Optional<SurveyResponse> findDetail(
            SurveyUserId userId,
            SurveyResponseId responseId
    ) {
        return responses.findByIdAndUserId(
                Objects.requireNonNull(responseId, "responseId"),
                Objects.requireNonNull(userId, "userId"));
    }
}
