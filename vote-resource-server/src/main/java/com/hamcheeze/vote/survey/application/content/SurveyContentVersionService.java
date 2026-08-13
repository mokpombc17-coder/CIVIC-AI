package com.hamcheeze.vote.survey.application.content;

import com.hamcheeze.vote.survey.application.port.out.SurveyContentVersionRepository;
import com.hamcheeze.vote.survey.domain.common.SurveyActorId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionId;
import com.hamcheeze.vote.survey.domain.common.SurveyContentVersionNumber;
import com.hamcheeze.vote.survey.domain.common.SurveyDomainException;
import com.hamcheeze.vote.survey.domain.common.SurveyOptionId;
import com.hamcheeze.vote.survey.domain.common.SurveyQuestionId;
import com.hamcheeze.vote.survey.domain.content.SurveyContentIdGenerator;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersion;
import com.hamcheeze.vote.survey.domain.content.SurveyContentVersionPublication;
import com.hamcheeze.vote.survey.domain.content.SurveyQuestion;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
public class SurveyContentVersionService {

    private final SurveyContentVersionRepository contents;
    private final Clock clock;

    @Autowired
    public SurveyContentVersionService(
            SurveyContentVersionRepository contents
    ) {
        this(contents, Clock.systemUTC());
    }

    SurveyContentVersionService(
            SurveyContentVersionRepository contents,
            Clock clock
    ) {
        this.contents = Objects.requireNonNull(contents, "contents");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional
    public SurveyContentVersion createDraft(
            CreateDraftCommand command,
            SurveyActorId actor
    ) {
        Objects.requireNonNull(command, "command");
        return contents.save(SurveyContentVersion.createDraft(
                new SurveyContentVersionId(UUID.randomUUID()),
                command.name(),
                command.description(),
                command.questions(),
                actor,
                clock.instant()));
    }

    @Transactional
    public SurveyContentVersion replaceDraft(
            SurveyContentVersionId contentVersionId,
            ReplaceDraftCommand command,
            SurveyActorId actor
    ) {
        Objects.requireNonNull(command, "command");
        SurveyContentVersion content = requireContent(contentVersionId);
        return contents.save(content.replaceDraft(
                command.name(),
                command.description(),
                command.questions(),
                actor,
                clock.instant()));
    }

    @Transactional
    public SurveyContentVersion clonePublishedVersion(
            SurveyContentVersionId sourceId,
            SurveyActorId actor
    ) {
        SurveyContentVersion source = requireContent(sourceId);
        SurveyContentVersion clone = source.clonePublishedVersionAsDraft(
                new SurveyContentVersionId(UUID.randomUUID()),
                new UuidContentIdGenerator(),
                actor,
                clock.instant());
        return contents.save(clone);
    }

    @Transactional
    public SurveyContentVersionPublication publish(
            SurveyContentVersionId contentVersionId,
            SurveyActorId actor
    ) {
        SurveyContentVersion content = requireContent(contentVersionId);
        SurveyContentVersionPublication publication = content.publish(
                nextVersionNumber(), actor, clock.instant());
        SurveyContentVersion saved = contents.save(
                publication.contentVersion());
        return new SurveyContentVersionPublication(
                saved, publication.event());
    }

    @Transactional(readOnly = true)
    public List<SurveyContentVersion> findAll() {
        return contents.findAll().stream()
                .sorted(Comparator.comparing(
                        SurveyContentVersion::createdAt).reversed())
                .toList();
    }

    @Transactional(readOnly = true)
    public Optional<SurveyContentVersion> findById(
            SurveyContentVersionId contentVersionId
    ) {
        return contents.findById(contentVersionId);
    }

    private SurveyContentVersion requireContent(
            SurveyContentVersionId contentVersionId
    ) {
        return contents.findById(Objects.requireNonNull(
                        contentVersionId, "contentVersionId"))
                .orElseThrow(() -> SurveyDomainException.invariant(
                        "SURVEY_CONTENT_NOT_FOUND",
                        "contentVersionId",
                        "survey content version does not exist"));
    }

    private SurveyContentVersionNumber nextVersionNumber() {
        int highest = contents.findAll().stream()
                .flatMap(content -> content.versionNumber().stream())
                .mapToInt(SurveyContentVersionNumber::value)
                .max()
                .orElse(0);
        return new SurveyContentVersionNumber(Math.addExact(highest, 1));
    }

    public record CreateDraftCommand(
            String name,
            String description,
            List<SurveyQuestion> questions
    ) {
        public CreateDraftCommand {
            questions = List.copyOf(Objects.requireNonNull(
                    questions, "questions"));
        }
    }

    public record ReplaceDraftCommand(
            String name,
            String description,
            List<SurveyQuestion> questions
    ) {
        public ReplaceDraftCommand {
            questions = List.copyOf(Objects.requireNonNull(
                    questions, "questions"));
        }
    }

    private static final class UuidContentIdGenerator
            implements SurveyContentIdGenerator {

        @Override
        public SurveyQuestionId nextQuestionId() {
            return new SurveyQuestionId(UUID.randomUUID());
        }

        @Override
        public SurveyOptionId nextOptionId() {
            return new SurveyOptionId(UUID.randomUUID());
        }
    }
}
