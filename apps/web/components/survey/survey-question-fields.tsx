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

const BIRTH_YEAR_GROUP_KEY = "demographics.birth-year";
const RESIDENCE_GROUP_KEY = "demographics.residence";
const RESIDENCE_HELP_TEXT = "행정구역 · 자치구 · 행정동을 순서대로 선택해 주세요";

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
        const groupPrompt =
          questions.length > 1 && group.prompt !== group.title ? group.prompt : null;
        const helperText =
          group.groupKey === RESIDENCE_GROUP_KEY ? RESIDENCE_HELP_TEXT : groupPrompt;
        return (
          <section className={styles.questionGroup} key={group.groupKey}>
            <div className={styles.questionGroupHeader}>
              <h3>{group.title}</h3>
              {helperText ? <p>{helperText}</p> : null}
              {group.description ? <p>{group.description}</p> : null}
            </div>
            <div className={styles.questionList}>
              {questions.map((question) => (
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
              ))}
            </div>
          </section>
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
      return (
        <fieldset aria-describedby={describedBy} className={styles.choiceGroup} id={controlId}>
          <legend className={styles.visuallyHidden}>{questionLabel}</legend>
          {sortSurveyOptions(question.options).map((option) => {
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
