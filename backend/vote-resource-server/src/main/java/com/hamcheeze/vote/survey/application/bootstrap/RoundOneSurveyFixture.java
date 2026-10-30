package com.hamcheeze.vote.survey.application.bootstrap;

import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionItemId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionItemLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionLineageKey;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionSectionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionSectionLineageKey;
import com.hamcheeze.vote.survey.domain.content.MultipleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.MatrixScaleRule;
import com.hamcheeze.vote.survey.domain.content.MatrixSingleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.NumberRule;
import com.hamcheeze.vote.survey.domain.content.QuestionRule;
import com.hamcheeze.vote.survey.domain.content.ShortTextRule;
import com.hamcheeze.vote.survey.domain.content.SingleChoiceRule;
import com.hamcheeze.vote.survey.domain.content.SurveyOption;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionItem;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionSection;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestionType;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.IntStream;

public final class RoundOneSurveyFixture {

    public static final int SECTION_COUNT = 7;
    public static final int QUESTION_COUNT = 29;
    public static final int MATRIX_QUESTION_COUNT = 3;
    public static final int ITEM_COUNT = 16;
    public static final Set<String> OPTIONAL_QUESTION_KEYS = Set.of(
            "wellbeing.health-status",
            "demographics.religion",
            "politics.ideology",
            "politics.supported-party");

    private RoundOneSurveyFixture() {
    }

    public static List<SurveyQuestion> questions() {
        List<SurveyQuestion> questions = new ArrayList<>();
        int order = 1;

        QuestionDefinition birthYear = definition(
                1, "1", "demographics.birth-year", "출생연도",
                "귀하의 출생연도는 어떻게 되십니까?",
                "[1개 선택 – dropbox]");
        questions.add(number(
                order++, birthYear,
                birthYear.prompt(), 1900, 2026));

        QuestionDefinition gender = definition(
                2, "2", "demographics.gender", "성별",
                "귀하의 성별은 어떻게 되십니까?",
                "[1개 선택]");
        questions.add(single(
                order++, gender, gender.prompt(),
                "남성", "여성"));

        QuestionDefinition residence = definition(
                3, "3", "demographics.residence", "주소지",
                "귀하의 현재 주소지는 어디입니까?",
                "(주소지 설문은 읍/면까지 포함)");
        questions.add(shortText(
                order++, residence,
                residence.prompt(), 200));

        QuestionDefinition maritalStatus = definition(
                4, "4", "demographics.marital-status", "혼인상태",
                "귀하의 결혼 여부는 어떻게 되십니까?",
                "[1개 선택]");
        questions.add(single(
                order++, maritalStatus,
                maritalStatus.prompt(), "미혼", "기혼", "기타"));

        QuestionDefinition family = definition(
                5, "5", "household.age-definition-presence", "가족 구성",
                "귀댁의 가구원 중 다음 각 연령대에 해당하는 분이 있습니까?",
                "[각 항목별 1개 선택]");
        questions.add(matrixSingle(
                order++, family, family.prompt(),
                items(family.questionKey(),
                        "infant", "영아",
                        "preschool", "유아",
                        "elementary-school", "초등",
                        "middle-school", "중등",
                        "high-school", "고등",
                        "senior", "실버"),
                "있음", "없음"));

        QuestionDefinition children = definition(
                6, "6", "household.has-children", "자녀 유무",
                "귀하께서는 자녀가 있으십니까?",
                "[1개 선택]");
        questions.add(single(order++, children,
                children.prompt(), "예", "아니오"));

        QuestionDefinition housing = definition(
                7, "7", "household.housing-tenure", "주거형태",
                "귀하께서 현재 살고 계신 주택의 보유형태는 어떻게 되십니까?",
                "[1개 선택]");
        questions.add(single(order++, housing,
                housing.prompt(),
                "자가(본인이나 가족의 소유)", "전세", "월세", "영구 임대", "사택", "기타"));

        QuestionDefinition occupation = definition(
                8, "8", "socioeconomic.occupation", "직업",
                "귀하의 직업은 다음 중 어디에 해당됩니까?",
                "[1개 선택]");
        questions.add(single(order++, occupation,
                occupation.prompt(),
                "농/임/어업", "공무원(공기업 포함)", "교사/학원강사", "전문직", "경영직",
                "사무직", "생산/기술/노무직", "서비스/영업/판매직", "자영업",
                "프리랜서/자유직", "전업주부", "학생", "무직", "기타"));

        QuestionDefinition education = definition(
                9, "9", "socioeconomic.education", "학력",
                "귀하의 최종학력은 어떻게 되십니까?",
                "[1개 선택]");
        questions.add(single(order++, education,
                education.prompt(),
                "고졸 미만(초등/중/고등학교 재학 포함)", "고졸", "대학 재학",
                "대학 졸업", "대학원 재학", "대학원 졸업"));

        QuestionDefinition income = definition(
                10, "10", "socioeconomic.household-income", "가구소득",
                "귀하와 귀하의 가족이 벌어들이는 연간소득은 어느 정도입니까? 이자소득 등 각종 수입을 모두 포함하여 답변해 주십시오.",
                "[1개 선택]");
        questions.add(single(order++, income,
                income.prompt(),
                "연간 1천만원 미만", "연간 1천만원 이상 ~ 3천만원 미만",
                "연간 3천만원 이상 ~ 5천만원 미만", "연간 5천만원 이상 ~ 7천만원 미만",
                "연간 7천만원 이상 ~ 1억원 미만", "연간 1억원 이상"));

        QuestionDefinition health = definition(
                11, "11", "wellbeing.health-status", "건강 상태",
                "귀하께서는 평소 본인의 건강 상태가 어떻다고 생각하십니까?",
                "[1개 선택]");
        questions.add(single(order++, health,
                health.prompt(), "매우 건강하다", "건강하다", "보통이다",
                "건강하지 못하다", "전혀 건강하지 못하다"));

        QuestionDefinition religion = definition(
                12, "12", "demographics.religion", "종교",
                "귀하께서 믿고 계신 종교는 무엇입니까?",
                "[1개 선택]");
        questions.add(single(order++, religion,
                religion.prompt(), "불교", "기독교(개신교)", "천주교(가톨릭)",
                "그 외", "종교 없음"));

        QuestionDefinition moral = definition(
                13, "13", "values.moral-foundation", "도덕 기반 성향",
                "귀하는 다음 두 가지 가치 가운데 평소 자신의 생각과 가장 가까운 것은 무엇입니까?",
                "[1개 선택]\nA. 남에게 피해를 주지 않는 것\n"
                        + "B. 내가 속한 집단에서 규칙을 지키고 잘 뭉치는 것");
        questions.add(single(order++, moral,
                moral.prompt(),
                "A는 많이 신경 쓰지만, B는 덜 신경 쓴다.",
                "A와 B를 모두 많이 신경 쓴다.",
                "둘 다 어느 정도 신경 쓰지만, B를 조금 더 신경 쓴다.",
                "둘 다 크게 따지지 않는 편이다."));

        QuestionDefinition ideology = definition(
                14, "14", "politics.ideology", "정치 성향",
                "귀하의 정치적 성향은 어떻다고 생각하십니까?",
                "[1개 선택]");
        questions.add(single(order++, ideology,
                ideology.prompt(), "매우 진보적", "다소 진보적", "중도",
                "다소 보수적", "매우 보수적"));

        QuestionDefinition party = definition(
                15, "15", "politics.supported-party", "지지정당",
                "귀하는 아래의 정당 가운데 어느 정당을 지지하고 계십니까?",
                "(순서는 의석 수입니다)");
        questions.add(single(order++, party,
                party.prompt(), "더불어민주당", "국민의힘", "조국혁신당", "진보당",
                "개혁신당", "기본소득당", "사회민주당", "지지정당 없음"));

        QuestionDefinition politicalInterest = definition(
                16, "16", "politics.interest", "정치 관심도",
                "귀하께서는 평소 정치에 대해 어느 정도 관심을 가지고 계십니까?",
                "[1개 선택]");
        questions.add(single(order++, politicalInterest,
                politicalInterest.prompt(), "매우 관심이 있다", "약간 관심이 있다",
                "별로 관심이 없다", "전혀 관심이 없다"));

        QuestionDefinition newsMedia = definition(
                17, "17", "media.news-sources", "선호매체",
                "귀하께서는 일상의 뉴스를 어떤 경로를 통해 얻으십니까? 해당하는 경로를 모두 선택해 주십시오.",
                "[복수 응답]");
        questions.add(multiple(order++, newsMedia,
                newsMedia.prompt(), 1, 5,
                "종이신문", "텔레비전", "라디오", "인터넷", "소셜미디어"));

        QuestionDefinition opinionPersistence = definition(
                18, "18", "attitude.opinion-persistence", "의견 고집 정도",
                "귀하는 다른 사람의 의견이나 새로운 정보를 접했을 때, 기존의 생각을 어느 정도 유지하는 편입니까?",
                "[1개 선택]");
        questions.add(single(order++, opinionPersistence,
                opinionPersistence.prompt(), "쉽게 바꾸는 편이다", "바꾸는 편이다",
                "상황에 따라 다르다", "유지하는 편이다", "거의 바꾸지 않는 편이다"));

        QuestionDefinition incomeSatisfaction = definition(
                19, "19", "wellbeing.income-satisfaction", "소득 만족도",
                "귀하께서는 현재의 소득에 대해 어느 정도 만족하십니까?",
                "[1개 선택]");
        questions.add(single(order++, incomeSatisfaction,
                incomeSatisfaction.prompt(), "매우 만족", "약간 만족", "보통",
                "약간 불만족", "매우 불만족"));

        QuestionDefinition distance = definition(
                20, "20", "social.affective-distance", "집단별 감정적 거리",
                "다음 각 집단에 대해 귀하께서 느끼는 감정적 거리를 0점에서 10점 사이로 평가해 주십시오.",
                "(0점 = 전혀 호감이 가지 않는다 ~ 10점 = 매우 호감이 간다)\n"
                        + "[각 항목별 1개 선택]");
        questions.add(matrixScale(
                order++, distance, distance.prompt(),
                items(distance.questionKey(),
                        "different-political-orientation", "나와 정치적 성향이 다른 사람",
                        "older-adults", "고령층",
                        "youth", "청년층",
                        "different-gender", "나와 성별이 다른 사람",
                        "different-religion", "나와 종교가 다른 사람",
                        "stranger", "처음 만난 낯선 사람",
                        "foreign-resident", "국내 거주 외국인"),
                0, 10,
                "전혀 호감이 가지 않는다", "매우 호감이 간다"));

        QuestionDefinition socialTrust = definition(
                21, "21", "trust.society", "사회 신뢰",
                "귀하께서는 우리 사회를 전반적으로 어느 정도 신뢰하십니까?",
                "[1개 선택]");
        questions.add(trust(order++, socialTrust));

        QuestionDefinition localGovernmentTrust = definition(
                22, "22", "trust.local-government", "지방정부 신뢰도",
                "귀하는 지방정부(기초자치단체 및 광역자치단체)에 대해서 어느 정도 신뢰하십니까?");
        questions.add(trust(order++, localGovernmentTrust));

        QuestionDefinition centralGovernmentTrust = definition(
                23, "23", "trust.central-government", "중앙정부 신뢰도",
                "귀하는 중앙정부에 대해서 어느 정도 신뢰하십니까?");
        questions.add(trust(order++, centralGovernmentTrust));

        QuestionDefinition mediaDuration = definition(
                24, "24", "media.daily-use-duration", "매체별 이용 시간",
                "귀하께서는 하루 평균 다음 매체를 얼마나 이용하십니까?",
                "[각 항목별 1개 선택]");
        String[] durationOptions = {
                "시청 안 함", "1시간 미만", "1시간 이상 ~ 3시간 미만", "3시간 이상"
        };
        questions.add(matrixSingle(
                order++, mediaDuration, mediaDuration.prompt(),
                items(mediaDuration.questionKey(),
                        "live-tv", "TV 실방",
                        "replay-tv", "TV 재방",
                        "radio", "라디오"),
                durationOptions));

        QuestionDefinition sns = definition(
                25, "25-A", "media.sns-use-frequency", "SNS 이용 빈도",
                "귀하께서는 SNS를 얼마나 자주 이용하십니까?",
                "[1개 선택]");
        questions.add(single(order++, sns, sns.prompt(),
                "매일 1회 이상", "주 5 ~ 6회", "주 3 ~ 4회", "주 1 ~ 2회",
                "월 2 ~ 3회", "월 1회 이하",
                "업로드는 하지 않고, 주로 다른 사람의 사진/동영상/글만 본다"));

        QuestionDefinition ott = definition(
                26, "25-B", "media.ott-daily-duration", "OTT 이용 시간",
                "귀하께서는 하루 평균 OTT 서비스를 얼마나 시청하십니까?",
                "[1개 선택]");
        questions.add(single(order++, ott, ott.prompt(),
                "시청 안 함", "1시간 미만", "1시간 이상 ~ 3시간 미만", "3시간 이상"));

        QuestionDefinition topics = definition(
                27, "26", "media.video-content-topics", "관심 주제 콘텐츠 탐색",
                "귀하께서 탐색하시는 동영상 콘텐츠 주제를 모두 선택해 주십시오.",
                "[해당하는 것 모두 선택]");
        questions.add(multiple(order++, topics,
                topics.prompt(), 1, 17,
                "드라마/영화", "음악/댄스", "푸드/먹방/레시피", "뉴스/시사/정치", "게임",
                "스포츠경기 중계/다시보기", "예능/코미디/웃긴 동영상",
                "연예계 소식/연예인/가십", "여행", "뷰티/패션", "애완동물/동물",
                "운동/헬스/요가/홈트레이닝", "학습/강의/업무/사용법/배우기",
                "일상 및 토크(Vlog)", "경제/재테크", "인테리어", "자동차/교통수단"));

        QuestionDefinition information = definition(
                28, "27", "information.practice-type", "정보 실천 유형",
                "평소 일상생활에서 여러 가지 정보를 알게 될 때, 귀하와 가장 가까운 방식은 무엇입니까?",
                "[1개 선택]");
        questions.add(single(order++, information,
                information.prompt(),
                "궁금한 것이 생기면 직접 찾아보거나 관련 정보가 있을 만한 곳을 찾아가서 알게 되는 편이다",
                "특별히 정보를 찾으려 하지 않고, 평소 보던 매체에서 정보를 자연스럽게 알게 되는 편이다",
                "내가 직접 찾기보다, 가족·친구·지인 등이 알려주거나 보내준 정보를 통해 알게 되는 편이다"));

        QuestionDefinition lifestyle = definition(
                29, "28", "lifestyle.risk-orientation", "생활양식",
                "귀하는 아래의 성향 가운데 어디에 가깝다고 생각하십니까?");
        questions.add(single(order, lifestyle,
                lifestyle.prompt(), "나는 조심스럽다", "나는 조금 조심스러운 편이다",
                "나는 조심스러운 편도, 모험을 즐기는 편도 아니다",
                "나는 모험을 즐기는 편이다", "나는 모험을 즐긴다"));

        List<SurveyQuestion> result = List.copyOf(questions);
        validate(result);
        return result;
    }

    private static SurveyQuestion trust(
            int order,
            QuestionDefinition definition
    ) {
        return single(order, definition, definition.prompt(),
                "전혀 신뢰하지 않는다", "별로 신뢰하지 않는다",
                "약간 신뢰한다", "매우 신뢰한다");
    }

    private static void validate(List<SurveyQuestion> questions) {
        if (questions.size() != QUESTION_COUNT) {
            throw new IllegalStateException(
                    "round one fixture must contain 29 questions");
        }
        List<SurveyQuestionSection> sections = questions.stream()
                .map(SurveyQuestion::section)
                .distinct()
                .sorted(java.util.Comparator.comparingInt(
                        SurveyQuestionSection::displayOrder))
                .toList();
        if (sections.size() != SECTION_COUNT) {
            throw new IllegalStateException(
                    "round one fixture must contain 7 sections");
        }
        List<Integer> expectedQuestionOrders = IntStream.rangeClosed(
                        1, QUESTION_COUNT)
                .boxed()
                .toList();
        if (!questions.stream().map(SurveyQuestion::displayOrder).toList()
                .equals(expectedQuestionOrders)) {
            throw new IllegalStateException(
                    "round one question displayOrder must be continuous");
        }
        List<Integer> expectedSectionOrders = IntStream.rangeClosed(
                        1, SECTION_COUNT)
                .boxed()
                .toList();
        if (!sections.stream().map(SurveyQuestionSection::displayOrder)
                .toList().equals(expectedSectionOrders)) {
            throw new IllegalStateException(
                    "round one section displayOrder must be continuous");
        }
        questions.forEach(question -> {
            if (!question.section().equals(sectionForQuestion(
                    question.displayOrder()))) {
                throw new IllegalStateException(
                        "round one question must belong to its canonical section");
            }
        });
        questions.forEach(question -> {
            question.options().forEach(option -> {
                String expectedKey = SurveyOption.localKeyForDisplayOrder(
                        option.displayOrder());
                if (!option.localKey().equals(expectedKey)) {
                    throw new IllegalStateException(
                            "round one option localKey must match displayOrder");
                }
            });
        });
        long matrixQuestions = questions.stream()
                .filter(question -> question.type().isMatrix())
                .count();
        long items = questions.stream()
                .flatMap(question -> question.items().stream())
                .count();
        if (matrixQuestions != MATRIX_QUESTION_COUNT || items != ITEM_COUNT) {
            throw new IllegalStateException(
                    "round one fixture must contain 3 matrix questions and 16 items");
        }
        long optionalQuestions = questions.stream()
                .filter(question -> !question.required())
                .count();
        if (optionalQuestions != OPTIONAL_QUESTION_KEYS.size()) {
            throw new IllegalStateException(
                    "round one fixture must contain every optional question");
        }
    }

    private static SurveyQuestion single(
            int globalOrder,
            QuestionDefinition definition,
            String prompt,
            String... labels
    ) {
        return question(
                globalOrder,
                definition,
                SurveyQuestionType.SINGLE_CHOICE,
                prompt,
                new SingleChoiceRule(),
                options(definition.questionKey(), labels));
    }

    private static SurveyQuestion multiple(
            int globalOrder,
            QuestionDefinition definition,
            String prompt,
            int minimum,
            int maximum,
            String... labels
    ) {
        return question(
                globalOrder,
                definition,
                SurveyQuestionType.MULTIPLE_CHOICE,
                prompt,
                new MultipleChoiceRule(minimum, maximum),
                options(definition.questionKey(), labels));
    }

    private static SurveyQuestion shortText(
            int globalOrder,
            QuestionDefinition definition,
            String prompt,
            int maxLength
    ) {
        return question(
                globalOrder, definition,
                SurveyQuestionType.SHORT_TEXT, prompt,
                new ShortTextRule(maxLength), List.of());
    }

    private static SurveyQuestion number(
            int globalOrder,
            QuestionDefinition definition,
            String prompt,
            int minimum,
            int maximum
    ) {
        return question(
                globalOrder, definition,
                SurveyQuestionType.NUMBER, prompt,
                NumberRule.integers(
                        BigDecimal.valueOf(minimum),
                        BigDecimal.valueOf(maximum)),
                List.of());
    }

    private static SurveyQuestion matrixSingle(
            int globalOrder,
            QuestionDefinition definition,
            String prompt,
            List<SurveyQuestionItem> items,
            String... labels
    ) {
        return question(
                globalOrder, definition,
                SurveyQuestionType.MATRIX_SINGLE_CHOICE,
                prompt,
                new MatrixSingleChoiceRule(),
                options(definition.questionKey(), labels),
                items);
    }

    private static SurveyQuestion matrixScale(
            int globalOrder,
            QuestionDefinition definition,
            String prompt,
            List<SurveyQuestionItem> items,
            int minimum,
            int maximum,
            String minimumLabel,
            String maximumLabel
    ) {
        return question(
                globalOrder, definition,
                SurveyQuestionType.MATRIX_SCALE,
                prompt,
                new MatrixScaleRule(
                        minimum, maximum, minimumLabel, maximumLabel),
                List.of(),
                items);
    }

    private static SurveyQuestion question(
            int globalOrder,
            QuestionDefinition definition,
            SurveyQuestionType type,
            String prompt,
            QuestionRule rule,
            List<SurveyOption> options
    ) {
        return question(
                globalOrder,
                definition,
                type,
                prompt,
                rule,
                options,
                List.of());
    }

    private static SurveyQuestion question(
            int globalOrder,
            QuestionDefinition definition,
            SurveyQuestionType type,
            String prompt,
            QuestionRule rule,
            List<SurveyOption> options,
            List<SurveyQuestionItem> items
    ) {
        String semanticKey = definition.questionKey();
        return new SurveyQuestion(
                new SurveyQuestionId(stableUuid("question:" + semanticKey)),
                new SurveyQuestionLineageKey(stableUuid(
                        "question-lineage:" + semanticKey)),
                definition.section(),
                definition.questionKey(),
                definition.sourceNumber(),
                definition.title(),
                type,
                prompt,
                definition.description(),
                globalOrder,
                !OPTIONAL_QUESTION_KEYS.contains(semanticKey),
                rule,
                options,
                items);
    }

    private static List<SurveyQuestionItem> items(
            String questionKey,
            String... keysAndLabels
    ) {
        if (keysAndLabels.length % 2 != 0) {
            throw new IllegalArgumentException(
                    "matrix items require key and label pairs");
        }
        List<SurveyQuestionItem> items = new ArrayList<>();
        for (int index = 0; index < keysAndLabels.length; index += 2) {
            int displayOrder = index / 2 + 1;
            String itemKey = keysAndLabels[index];
            String semanticKey = questionKey + "/" + itemKey;
            items.add(new SurveyQuestionItem(
                    new SurveyQuestionItemId(stableUuid(
                            "item:" + semanticKey)),
                    new SurveyQuestionItemLineageKey(stableUuid(
                            "item-lineage:" + semanticKey)),
                    itemKey,
                    keysAndLabels[index + 1],
                    displayOrder));
        }
        return List.copyOf(items);
    }

    private static List<SurveyOption> options(
            String questionSemanticKey,
            String... labels
    ) {
        List<SurveyOption> options = new ArrayList<>();
        for (int index = 0; index < labels.length; index++) {
            int displayOrder = index + 1;
            String localKey = SurveyOption.localKeyForDisplayOrder(displayOrder);
            options.add(SurveyOption.standard(
                    new SurveyOptionId(stableUuid(
                            "option:" + questionSemanticKey + ":" + localKey)),
                    new SurveyOptionLineageKey(stableUuid(
                            "option-lineage:" + questionSemanticKey + ":"
                                    + localKey)),
                    localKey,
                    labels[index],
                    displayOrder));
        }
        return List.copyOf(options);
    }

    private static QuestionDefinition definition(
            int displayOrder,
            String sourceNumber,
            String questionKey,
            String title,
            String prompt
    ) {
        return definition(
                displayOrder,
                sourceNumber,
                questionKey,
                title,
                prompt,
                null);
    }

    private static QuestionDefinition definition(
            int displayOrder,
            String sourceNumber,
            String questionKey,
            String title,
            String prompt,
            String description
    ) {
        return new QuestionDefinition(
                sectionForQuestion(displayOrder),
                questionKey,
                sourceNumber,
                title,
                prompt,
                description,
                displayOrder);
    }

    private static SurveyQuestionSection sectionForQuestion(
            int questionDisplayOrder
    ) {
        if (questionDisplayOrder <= 3) {
            return section(1, "personal-information", "일반 개인정보");
        }
        if (questionDisplayOrder <= 6) {
            return section(2, "household-information", "가구 정보");
        }
        if (questionDisplayOrder <= 12) {
            return section(3, "life-economy", "생활 · 경제");
        }
        if (questionDisplayOrder <= 16) {
            return section(4, "values-politics", "가치 · 정치 성향");
        }
        if (questionDisplayOrder <= 19) {
            return section(5, "media-opinion", "미디어 · 의견 성향");
        }
        if (questionDisplayOrder <= 23) {
            return section(
                    6,
                    "social-institutional-trust",
                    "사회 · 기관 신뢰");
        }
        if (questionDisplayOrder <= QUESTION_COUNT) {
            return section(
                    7,
                    "media-information-habits",
                    "매체 이용 · 정보 습관");
        }
        throw new IllegalArgumentException(
                "unknown round one definition displayOrder: "
                        + questionDisplayOrder);
    }

    private static SurveyQuestionSection section(
            int displayOrder,
            String sectionKey,
            String title
    ) {
        return new SurveyQuestionSection(
                new SurveyQuestionSectionId(stableUuid(
                        "section:" + sectionKey)),
                new SurveyQuestionSectionLineageKey(stableUuid(
                        "section-lineage:" + sectionKey)),
                sectionKey,
                title,
                null,
                displayOrder);
    }

    private static UUID stableUuid(String value) {
        return UUID.nameUUIDFromBytes(
                ("round-one-survey:" + value)
                        .getBytes(StandardCharsets.UTF_8));
    }

    private record QuestionDefinition(
            SurveyQuestionSection section,
            String questionKey,
            String sourceNumber,
            String title,
            String prompt,
            String description,
            int displayOrder
    ) {
    }
}
