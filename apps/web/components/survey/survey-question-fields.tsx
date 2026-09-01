import {
  getSurveyQuestionLabel,
  sortSurveyGroups,
  sortSurveyOptions,
  sortSurveyQuestions,
  type SurveyQuestion,
  type SurveyQuestionSection,
} from "@/lib/survey/survey-contracts";
import type {
  SurveyAnswerDraft,
  SurveyAnswerState,
  SurveySelectionDraft,
  SurveyValidationErrors,
} from "@/lib/survey/survey-answer-state";
import styles from "./survey.module.css";
import { getSurveyQuestionPresentation } from "./survey-presentation";

const BIRTH_YEAR_GROUP_KEY = "demographics.birth-year";
const RESIDENCE_GROUP_KEY = "demographics.residence";
const AGE_GROUP_PRESENCE_GROUP_KEY = "household.age-group-presence";
const AFFECTIVE_DISTANCE_GROUP_KEY = "social.affective-distance";
const MEDIA_DAILY_USE_DURATION_GROUP_KEY = "media.daily-use-duration";

export function SurveySectionFields({
  answers,
  errors,
  onAnswerChange,
  section,
}: {
  answers: SurveyAnswerState;
  errors: SurveyValidationErrors;
  onAnswerChange: (questionId: string, answer: SurveyAnswerDraft) => void;
  section: SurveyQuestionSection;
}) {
  const groups = sortSurveyGroups(section.groups);

  return (
    <div className={styles.sectionFields}>
      {section.description ? (
        <p className={styles.sectionDescription}>{section.description}</p>
      ) : null}
      {groups.map((group) => {
        const questions = sortSurveyQuestions(group.questions);
        const isAgeGroupPresence = group.groupKey === AGE_GROUP_PRESENCE_GROUP_KEY;
        const isAffectiveDistance = group.groupKey === AFFECTIVE_DISTANCE_GROUP_KEY;
        const isMediaDailyUseDuration = group.groupKey === MEDIA_DAILY_USE_DURATION_GROUP_KEY;
        const groupPrompt =
          questions.length > 1 && group.prompt !== group.title ? group.prompt : null;
        const presentation = getSurveyQuestionPresentation(group.groupKey);
        const helperText = presentation?.helperText ?? groupPrompt;
        const usesFieldHelperSpacing =
          Boolean(presentation?.helperText) &&
          group.groupKey !== RESIDENCE_GROUP_KEY &&
          (questions.length === 1 || isAffectiveDistance || isMediaDailyUseDuration);
        return (
          <section className={styles.questionGroup} key={group.groupKey}>
            <div
              className={styles.questionGroupHeader}
              data-helper-layout={usesFieldHelperSpacing ? "field" : undefined}
            >
              <h3>{presentation?.title ?? group.title}</h3>
              {helperText ? <p>{helperText}</p> : null}
              {group.description ? <p>{group.description}</p> : null}
            </div>
            <div className={styles.questionList}>
              {isMediaDailyUseDuration ? (
                <MediaDailyUseDurationMatrix
                  answers={answers}
                  errors={errors}
                  groupKey={group.groupKey}
                  onAnswerChange={onAnswerChange}
                  optionLabels={presentation?.optionLabels}
                  questions={questions}
                  sectionKey={section.sectionKey}
                />
              ) : isAffectiveDistance ? (
                <AffectiveDistanceMatrix
                  answers={answers}
                  errors={errors}
                  groupKey={group.groupKey}
                  onAnswerChange={onAnswerChange}
                  questions={questions}
                  sectionKey={section.sectionKey}
                />
              ) : isAgeGroupPresence ? (
                <AgeGroupPresenceMatrix
                  answers={answers}
                  errors={errors}
                  groupKey={group.groupKey}
                  onAnswerChange={onAnswerChange}
                  questions={questions}
                  sectionKey={section.sectionKey}
                />
              ) : (
                questions.map((question) => (
                  <SurveyQuestionField
                    answer={answers[question.questionId]}
                    controlId={`survey-question-${section.sectionKey}-${group.groupKey}-${question.itemKey}`}
                    error={errors[question.questionId]}
                    groupKey={group.groupKey}
                    key={question.itemKey}
                    onChange={(answer) => onAnswerChange(question.questionId, answer)}
                    question={question}
                    questionLabel={getSurveyQuestionLabel(group, question)}
                    showItemLabel={questions.length > 1}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MediaDailyUseDurationMatrix({
  answers,
  errors,
  groupKey,
  onAnswerChange,
  optionLabels,
  questions,
  sectionKey,
}: {
  answers: SurveyAnswerState;
  errors: SurveyValidationErrors;
  groupKey: string;
  onAnswerChange: (questionId: string, answer: SurveyAnswerDraft) => void;
  optionLabels: Readonly<Record<string, string>> | undefined;
  questions: readonly SurveyQuestion[];
  sectionKey: string;
}) {
  return (
    <div className={styles.mediaDurationMatrix}>
      {questions.map((question) => {
        const controlId = `survey-question-${sectionKey}-${groupKey}-${question.itemKey}`;
        const labelId = `${controlId}-label`;
        const errorId = `${controlId}-error`;
        const error = errors[question.questionId];

        if (question.type !== "SINGLE_CHOICE") {
          return (
            <SurveyQuestionField
              answer={answers[question.questionId]}
              controlId={controlId}
              error={error}
              groupKey={groupKey}
              key={question.itemKey}
              onChange={(answer) => onAnswerChange(question.questionId, answer)}
              question={question}
              questionLabel={question.itemLabel?.trim() || question.prompt}
              showItemLabel
            />
          );
        }

        const answer = answers[question.questionId];
        const selection = answer?.type === "SINGLE_CHOICE" ? answer.selection : null;

        return (
          <div
            className={styles.mediaDurationItem}
            data-invalid={error ? "true" : undefined}
            key={question.itemKey}
          >
            <p className={styles.mediaDurationLabel} id={labelId}>
              {question.itemLabel?.trim() || question.prompt}
            </p>
            <div
              aria-describedby={error ? errorId : undefined}
              aria-labelledby={labelId}
              aria-required={question.required || undefined}
              className={styles.mediaDurationOptions}
              id={controlId}
              role="radiogroup"
            >
              {sortSurveyOptions(question.options).map((option) => {
                const isSelected = selection?.optionId === option.optionId;
                return (
                  <label
                    className={styles.mediaDurationOption}
                    data-selected={isSelected ? "true" : undefined}
                    key={option.optionLocalKey}
                  >
                    <input
                      checked={isSelected}
                      name={controlId}
                      onChange={() =>
                        onAnswerChange(question.questionId, {
                          type: "SINGLE_CHOICE",
                          selection: { optionId: option.optionId, inputText: "" },
                        })
                      }
                      type="radio"
                      value={option.optionId}
                    />
                    <span>{optionLabels?.[option.optionLocalKey] ?? option.label}</span>
                  </label>
                );
              })}
            </div>
            {error ? (
              <p className={styles.questionError} id={errorId} role="alert">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function AffectiveDistanceMatrix({
  answers,
  errors,
  groupKey,
  onAnswerChange,
  questions,
  sectionKey,
}: {
  answers: SurveyAnswerState;
  errors: SurveyValidationErrors;
  groupKey: string;
  onAnswerChange: (questionId: string, answer: SurveyAnswerDraft) => void;
  questions: readonly SurveyQuestion[];
  sectionKey: string;
}) {
  return (
    <div className={styles.affectiveDistanceMatrix}>
      {questions.map((question) => {
        const controlId = `survey-question-${sectionKey}-${groupKey}-${question.itemKey}`;
        const labelId = `${controlId}-label`;
        const errorId = `${controlId}-error`;
        const error = errors[question.questionId];

        if (question.type !== "SCALE") {
          return (
            <SurveyQuestionField
              answer={answers[question.questionId]}
              controlId={controlId}
              error={error}
              groupKey={groupKey}
              key={question.itemKey}
              onChange={(answer) => onAnswerChange(question.questionId, answer)}
              question={question}
              questionLabel={question.itemLabel?.trim() || question.prompt}
              showItemLabel
            />
          );
        }

        const answer = answers[question.questionId];
        const value = answer?.type === "SCALE" ? answer.scale : null;
        const minimum = question.rule.minimum ?? 0;
        const maximum = question.rule.maximum ?? 10;

        return (
          <div
            className={styles.affectiveDistanceItem}
            data-invalid={error ? "true" : undefined}
            key={question.itemKey}
          >
            <p className={styles.affectiveDistanceLabel} id={labelId}>
              {question.itemLabel?.trim() || question.prompt}
            </p>
            <div
              aria-describedby={error ? errorId : undefined}
              aria-labelledby={labelId}
              aria-required={question.required || undefined}
              className={styles.affectiveDistanceOptions}
              id={controlId}
              role="radiogroup"
            >
              {Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index).map(
                (scale) => (
                  <label className={styles.affectiveDistanceOption} key={scale}>
                    <input
                      checked={value === scale}
                      name={controlId}
                      onChange={() => onAnswerChange(question.questionId, { type: "SCALE", scale })}
                      type="radio"
                      value={scale}
                    />
                    <span>{scale}</span>
                  </label>
                ),
              )}
            </div>
            {error ? (
              <p className={styles.questionError} id={errorId} role="alert">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function AgeGroupPresenceMatrix({
  answers,
  errors,
  groupKey,
  onAnswerChange,
  questions,
  sectionKey,
}: {
  answers: SurveyAnswerState;
  errors: SurveyValidationErrors;
  groupKey: string;
  onAnswerChange: (questionId: string, answer: SurveyAnswerDraft) => void;
  questions: readonly SurveyQuestion[];
  sectionKey: string;
}) {
  return (
    <div className={styles.familyMatrix}>
      {questions.map((question) => {
        const controlId = `survey-question-${sectionKey}-${groupKey}-${question.itemKey}`;
        const labelId = `${controlId}-label`;
        const errorId = `${controlId}-error`;
        const error = errors[question.questionId];

        if (question.type !== "SINGLE_CHOICE") {
          return (
            <SurveyQuestionField
              answer={answers[question.questionId]}
              controlId={controlId}
              error={error}
              groupKey={groupKey}
              key={question.itemKey}
              onChange={(answer) => onAnswerChange(question.questionId, answer)}
              question={question}
              questionLabel={question.itemLabel?.trim() || question.prompt}
              showItemLabel
            />
          );
        }

        const answer = answers[question.questionId];
        const selection = answer?.type === "SINGLE_CHOICE" ? answer.selection : null;

        return (
          <div
            className={styles.familyMatrixItem}
            data-invalid={error ? "true" : undefined}
            key={question.itemKey}
          >
            <div className={styles.familyMatrixRow}>
              <p className={styles.familyMatrixLabel} id={labelId}>
                {question.itemLabel?.trim() || question.prompt}
              </p>
              <div
                aria-describedby={error ? errorId : undefined}
                aria-labelledby={labelId}
                aria-required={question.required || undefined}
                className={styles.familyMatrixOptions}
                id={controlId}
                role="radiogroup"
              >
                {sortSurveyOptions(question.options).map((option) => {
                  const isSelected = selection?.optionId === option.optionId;
                  return (
                    <label
                      className={styles.familyMatrixOption}
                      data-selected={isSelected ? "true" : undefined}
                      key={option.optionLocalKey}
                    >
                      <input
                        checked={isSelected}
                        name={controlId}
                        onChange={() =>
                          onAnswerChange(question.questionId, {
                            type: "SINGLE_CHOICE",
                            selection: { optionId: option.optionId, inputText: "" },
                          })
                        }
                        type="radio"
                        value={option.optionId}
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            {error ? (
              <p className={styles.questionError} id={errorId} role="alert">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SurveyQuestionField({
  answer,
  controlId,
  error,
  groupKey,
  onChange,
  question,
  questionLabel,
  showItemLabel,
}: {
  answer: SurveyAnswerDraft | undefined;
  controlId: string;
  error: string | undefined;
  groupKey: string;
  onChange: (answer: SurveyAnswerDraft) => void;
  question: SurveyQuestion;
  questionLabel: string;
  showItemLabel: boolean;
}) {
  const errorId = `${controlId}-error`;
  const descriptionId = `${controlId}-description`;
  const describedBy = [question.description ? descriptionId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.questionField} data-invalid={error ? "true" : undefined}>
      {showItemLabel ? (
        <label className={styles.questionLabel} htmlFor={controlId}>
          {questionLabel}
          {question.required ? <span aria-label="필수"> *</span> : null}
        </label>
      ) : null}
      {question.description ? (
        <p className={styles.questionDescription} id={descriptionId}>
          {question.description}
        </p>
      ) : null}
      <SurveyQuestionControl
        answer={answer}
        controlId={controlId}
        describedBy={describedBy || undefined}
        groupKey={groupKey}
        onChange={onChange}
        question={question}
        questionLabel={questionLabel}
      />
      {error ? (
        <p className={styles.questionError} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SurveyQuestionControl({
  answer,
  controlId,
  describedBy,
  groupKey,
  onChange,
  question,
  questionLabel,
}: {
  answer: SurveyAnswerDraft | undefined;
  controlId: string;
  describedBy: string | undefined;
  groupKey: string;
  onChange: (answer: SurveyAnswerDraft) => void;
  question: SurveyQuestion;
  questionLabel: string;
}) {
  if (groupKey === RESIDENCE_GROUP_KEY && question.type === "SHORT_TEXT") {
    return (
      <ResidenceTextInputs
        answer={answer}
        controlId={controlId}
        describedBy={describedBy}
        maxLength={question.rule.maxLength}
        onChange={onChange}
      />
    );
  }

  switch (question.type) {
    case "SINGLE_CHOICE": {
      const selection = answer?.type === question.type ? answer.selection : null;
      const options = sortSurveyOptions(question.options);
      const selectedOption = options.find((option) => option.optionId === selection?.optionId);
      return (
        <>
          <select
            aria-describedby={describedBy}
            aria-label={questionLabel}
            className={styles.selectControl}
            data-empty={selection ? undefined : "true"}
            id={controlId}
            onChange={(event) =>
              onChange({
                type: "SINGLE_CHOICE",
                selection: event.target.value
                  ? { optionId: event.target.value, inputText: "" }
                  : null,
              })
            }
            value={selection?.optionId ?? ""}
          >
            <option value="">선택</option>
            {options.map((option) => (
              <option key={option.optionLocalKey} value={option.optionId}>
                {option.label}
              </option>
            ))}
          </select>
          {selectedOption?.kind === "OTHER" && selection ? (
            <OtherTextInput
              controlId={`${controlId}-other`}
              onChange={(inputText) =>
                onChange({ type: "SINGLE_CHOICE", selection: { ...selection, inputText } })
              }
              value={selection.inputText}
            />
          ) : null}
        </>
      );
    }
    case "MULTIPLE_CHOICE": {
      const selections = answer?.type === question.type ? answer.selections : [];
      const options = sortSurveyOptions(question.options);
      const selectedOptions = options.filter((option) =>
        selections.some((selection) => selection.optionId === option.optionId),
      );
      const summary =
        selectedOptions.length === 0
          ? "복수 선택"
          : selectedOptions.length === 1
            ? selectedOptions[0]!.label
            : `${selectedOptions.length}개 선택`;
      return (
        <details className={styles.multiSelect}>
          <summary
            aria-describedby={describedBy}
            aria-label={`${questionLabel} 복수 선택`}
            className={`${styles.selectControl} ${styles.multiSelectSummary}`}
            data-empty={selectedOptions.length === 0 ? "true" : undefined}
            id={controlId}
          >
            {summary}
          </summary>
          <fieldset
            aria-label={`${questionLabel} 선택지`}
            className={`${styles.choiceGroup} ${styles.multiSelectMenu}`}
          >
            {options.map((option) => {
              const selection = selections.find((item) => item.optionId === option.optionId);
              return (
                <div className={styles.choiceItem} key={option.optionLocalKey}>
                  <label>
                    <input
                      checked={Boolean(selection)}
                      onChange={(event) =>
                        onChange({
                          type: "MULTIPLE_CHOICE",
                          selections: event.target.checked
                            ? [...selections, { optionId: option.optionId, inputText: "" }]
                            : selections.filter((item) => item.optionId !== option.optionId),
                        })
                      }
                      type="checkbox"
                    />
                    <span>{option.label}</span>
                  </label>
                  {option.kind === "OTHER" && selection ? (
                    <OtherTextInput
                      controlId={`${controlId}-${option.optionLocalKey}-other`}
                      onChange={(inputText) =>
                        onChange({
                          type: "MULTIPLE_CHOICE",
                          selections: replaceSelection(selections, { ...selection, inputText }),
                        })
                      }
                      value={selection.inputText}
                    />
                  ) : null}
                </div>
              );
            })}
          </fieldset>
        </details>
      );
    }
    case "SHORT_TEXT":
    case "LONG_TEXT": {
      const value = answer?.type === question.type ? answer.text : "";
      const commonProps = {
        "aria-describedby": describedBy,
        "aria-label": questionLabel,
        className: styles.textControl,
        id: controlId,
        maxLength: question.rule.maxLength ?? undefined,
        onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          onChange({ type: question.type as "SHORT_TEXT" | "LONG_TEXT", text: event.target.value }),
        value,
      };
      return question.type === "LONG_TEXT" ? (
        <textarea {...commonProps} rows={4} />
      ) : (
        <input {...commonProps} type="text" />
      );
    }
    case "NUMBER": {
      const value = answer?.type === question.type ? answer.number : null;
      if (canRenderNumberSelect(question)) {
        const minimum = question.rule.minimum!;
        const maximum = question.rule.maximum!;
        return (
          <select
            aria-describedby={describedBy}
            aria-label={questionLabel}
            className={styles.selectControl}
            data-empty={value === null ? "true" : undefined}
            id={controlId}
            onChange={(event) =>
              onChange({
                type: "NUMBER",
                number: event.target.value ? Number(event.target.value) : null,
              })
            }
            value={value ?? ""}
          >
            <option value="">{groupKey === BIRTH_YEAR_GROUP_KEY ? "YYYY" : "선택"}</option>
            {Array.from({ length: maximum - minimum + 1 }, (_, index) => maximum - index).map(
              (number) => (
                <option key={number} value={number}>
                  {number}
                </option>
              ),
            )}
          </select>
        );
      }
      return (
        <input
          aria-describedby={describedBy}
          aria-label={questionLabel}
          className={styles.textControl}
          id={controlId}
          inputMode={question.rule.decimalAllowed === false ? "numeric" : "decimal"}
          max={question.rule.maximum ?? undefined}
          min={question.rule.minimum ?? undefined}
          onChange={(event) =>
            onChange({
              type: "NUMBER",
              number: event.target.value === "" ? null : event.target.valueAsNumber,
            })
          }
          step={question.rule.decimalAllowed === false ? 1 : "any"}
          type="number"
          value={value ?? ""}
        />
      );
    }
    case "SCALE": {
      const value = answer?.type === question.type ? answer.scale : null;
      const minimum = question.rule.minimum ?? 0;
      const maximum = question.rule.maximum ?? 10;
      return (
        <fieldset aria-describedby={describedBy} className={styles.scaleField} id={controlId}>
          <legend className={styles.visuallyHidden}>{questionLabel}</legend>
          <div className={styles.scaleOptions}>
            {Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index).map(
              (scale) => (
                <label className={styles.scaleOption} key={scale}>
                  <input
                    checked={value === scale}
                    name={controlId}
                    onChange={() => onChange({ type: "SCALE", scale })}
                    type="radio"
                  />
                  <span>{scale}</span>
                </label>
              ),
            )}
          </div>
          <div className={styles.scaleLabels}>
            <span>{question.rule.minimumLabel}</span>
            <span>{question.rule.maximumLabel}</span>
          </div>
        </fieldset>
      );
    }
  }
}

function ResidenceTextInputs({
  answer,
  controlId,
  describedBy,
  maxLength,
  onChange,
}: {
  answer: SurveyAnswerDraft | undefined;
  controlId: string;
  describedBy: string | undefined;
  maxLength: number | null;
  onChange: (answer: SurveyAnswerDraft) => void;
}) {
  const segments =
    answer?.type === "SHORT_TEXT" && answer.inputSegments
      ? [...answer.inputSegments]
      : ["", "", ""];
  const fields = [
    { autoComplete: "address-level1", label: "행정구역", placeholder: "행정구역 (예: 서울특별시)" },
    { autoComplete: "address-level2", label: "자치구", placeholder: "자치구 (예: 동대문구)" },
    { autoComplete: "address-line1", label: "행정동", placeholder: "행정동 (예: 장안동)" },
  ] as const;

  function updateSegment(index: number, value: string) {
    const nextSegments = fields.map((_, fieldIndex) =>
      fieldIndex === index ? value : (segments[fieldIndex] ?? ""),
    );
    onChange({
      type: "SHORT_TEXT",
      inputSegments: nextSegments,
      text: nextSegments
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join(" "),
    });
  }

  return (
    <div className={styles.residenceFields}>
      {fields.map((field, index) => (
        <input
          aria-describedby={describedBy}
          aria-label={field.label}
          autoComplete={field.autoComplete}
          className={styles.textControl}
          id={`${controlId}-${index + 1}`}
          key={field.label}
          maxLength={maxLength ?? undefined}
          onChange={(event) => updateSegment(index, event.target.value)}
          placeholder={field.placeholder}
          type="text"
          value={segments[index] ?? ""}
        />
      ))}
    </div>
  );
}

function OtherTextInput({
  controlId,
  onChange,
  value,
}: {
  controlId: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <input
      aria-label="기타 내용"
      className={styles.otherTextControl}
      id={controlId}
      onChange={(event) => onChange(event.target.value)}
      placeholder="내용을 입력해 주세요."
      type="text"
      value={value}
    />
  );
}

function replaceSelection(
  selections: readonly SurveySelectionDraft[],
  next: SurveySelectionDraft,
): SurveySelectionDraft[] {
  return selections.map((selection) => (selection.optionId === next.optionId ? next : selection));
}

function canRenderNumberSelect(question: SurveyQuestion): boolean {
  const { decimalAllowed, minimum, maximum } = question.rule;
  return (
    decimalAllowed === false &&
    minimum !== null &&
    maximum !== null &&
    Number.isInteger(minimum) &&
    Number.isInteger(maximum) &&
    maximum >= minimum &&
    maximum - minimum <= 200
  );
}
