package com.hamcheeze.vote.survey.application.bootstrap;

/** Local/staging-only consent document used for end-to-end flow checks. */
public final class LocalSurveyConsentFixture {

    public static final String DOCUMENT_CODE =
            "survey-participation-consent";
    public static final String DOCUMENT_VERSION = "local-v1";
    public static final String TITLE = "설문 참여 동의 (테스트 전용)";
    public static final String CONTENT = """
            이 문서는 local/staging 설문 동의 흐름 검증을 위한 테스트 전용 문서입니다.
            실제 운영 동의 문구로 사용하지 마세요.
            """;

    private LocalSurveyConsentFixture() {
    }
}
