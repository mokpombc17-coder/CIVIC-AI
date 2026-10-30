package com.hamcheeze.vote.survey.domain.common;

import java.util.UUID;

/**
 * Marker for UUID-backed identifiers owned by the survey domain.
 */
public interface SurveyId {

    UUID value();
}
