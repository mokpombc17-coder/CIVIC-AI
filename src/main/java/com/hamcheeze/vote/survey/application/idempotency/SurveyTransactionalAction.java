package com.hamcheeze.vote.survey.application.idempotency;

@FunctionalInterface
public interface SurveyTransactionalAction<T> {

    T execute();
}
