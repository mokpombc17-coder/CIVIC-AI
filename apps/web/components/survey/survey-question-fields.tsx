import type { ChangeEvent, KeyboardEvent } from "react";
import type { SurveyQuestion, SurveySection } from "@/lib/survey/survey-contracts";
import {
  surveyAnswerErrorKey,
  type SurveyAnswerDraft,
  type SurveyAnswerState,
  type SurveyValidationErrors,
} from "@/lib/survey/survey-answer-state";
import {
  getSurveyMatrixChoiceLayout,
  getSurveyMatrixOptionLabel,
  getSurveyQuestionPresentation,
} from "./survey-presentation";
import { SurveyMultiSelect } from "./survey-multi-select";
import { SurveySelect } from "./survey-select";
import styles from "./survey.module.css";

const BIRTH_YEAR_KEY = "demographics.birth-year";
const RESIDENCE_KEY = "demographics.residence";

export function SurveySectionFields({
  answers,
  errors,
  onAnswerChange,
  section,
}: {
  answers: SurveyAnswerState;
  errors: SurveyValidationErrors;
  onAnswerChange: (questionId: string, answer: SurveyAnswerDraft) => void;
  section: SurveySection;
}) {
  return (
    <div className={styles.sectionFields}>
      {section.questions.map((question) => {
        const presentation = getSurveyQuestionPresentation(question.questionKey);
        const helperText = presentation?.helperText ?? null;
        return (
          <section className={styles.questionGroup} key={question.questionKey}>
            <div
              className={styles.questionGroupHeader}
              data-helper-layout={
                helperText && question.questionKey !== RESIDENCE_KEY ? "field" : undefined
              }
            >
              <h3>{presentation?.title ?? question.title}</h3>
              {helperText ? <p>{helperText}</p> : null}
            </div>
            <div className={styles.questionList}>
              <SurveyQuestionField
                answer={answers[question.questionId]}
                errors={errors}
                onChange={(answer) => onAnswerChange(question.questionId, answer)}
                question={question}
                sectionKey={section.sectionKey}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SurveyQuestionField({
  answer,
  errors,
  onChange,
  question,
  sectionKey,
}: {
  answer: SurveyAnswerDraft | undefined;
  errors: SurveyValidationErrors;
  onChange: (answer: SurveyAnswerDraft) => void;
  question: SurveyQuestion;
  sectionKey: string;
}) {
  if (question.type === "MATRIX_SINGLE_CHOICE") {
    return (
      <MatrixChoiceField
        answer={answer}
        errors={errors}
        mode={getSurveyMatrixChoiceLayout(question.questionKey)}
        onChange={onChange}
        question={question}
        sectionKey={sectionKey}
      />
    );
  }
  if (question.type === "MATRIX_SCALE") {
    return (
      <MatrixScaleField
        answer={answer}
        errors={errors}
        onChange={onChange}
        question={question}
        sectionKey={sectionKey}
      />
    );
  }

  const controlId = `survey-question-${sectionKey}-${question.questionKey}`;
  const error = errors[surveyAnswerErrorKey(question.questionId)];
  const errorId = `${controlId}-error`;
  return (
    <div className={styles.questionField} data-invalid={error ? "true" : undefined}>
      <SurveyQuestionControl
        answer={answer}
        controlId={controlId}
        describedBy={error ? errorId : undefined}
        onChange={onChange}
        question={question}
      />
      {error ? (
        <p className={styles.questionError} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function MatrixChoiceField({
  answer,
  errors,
  mode,
  onChange,
  question,
  sectionKey,
}: {
  answer: SurveyAnswerDraft | undefined;
  errors: SurveyValidationErrors;
  mode: "family" | "media";
  onChange: (answer: SurveyAnswerDraft) => void;
  question: Extract<SurveyQuestion, { type: "MATRIX_SINGLE_CHOICE" }>;
  sectionKey: string;
}) {
  const itemAnswers = answer?.type === question.type ? answer.itemAnswers : {};
  const containerClass = mode === "family" ? styles.familyMatrix : styles.mediaDurationMatrix;
  const itemClass = mode === "family" ? styles.familyMatrixItem : styles.mediaDurationItem;
  const labelClass = mode === "family" ? styles.familyMatrixLabel : styles.mediaDurationLabel;
  const optionsClass = mode === "family" ? styles.familyMatrixOptions : styles.mediaDurationOptions;
  const optionClass = mode === "family" ? styles.familyMatrixOption : styles.mediaDurationOption;

  return (
    <div className={containerClass}>
      {question.items.map((item) => {
        const controlId = `survey-question-${sectionKey}-${question.questionKey}-${item.itemKey}`;
        const labelId = `${controlId}-label`;
        const errorId = `${controlId}-error`;
        const error = errors[surveyAnswerErrorKey(question.questionId, item.itemId)];
        const selection = itemAnswers[item.itemId];
        const content = (
          <>
            <p className={labelClass} id={labelId}>
              {item.itemLabel}
            </p>
            <div
              aria-describedby={error ? errorId : undefined}
              aria-labelledby={labelId}
              aria-required={question.required || undefined}
              className={optionsClass}
              id={controlId}
              role="radiogroup"
            >
              {question.options.map((option) => {
                const selected = selection?.optionId === option.optionId;
                return (
                  <label
                    className={optionClass}
                    data-selected={selected ? "true" : undefined}
                    key={option.optionId}
                  >
                    <input
                      checked={selected}
                      name={controlId}
                      onChange={() =>
                        onChange({
                          type: "MATRIX_SINGLE_CHOICE",
                          itemAnswers: {
                            ...itemAnswers,
                            [item.itemId]: { optionId: option.optionId },
                          },
                        })
                      }
                      onKeyDown={selectRadioOnEnter}
                      type="radio"
                      value={option.optionId}
                    />
                    <span>{getSurveyMatrixOptionLabel(question.questionKey, option.label)}</span>
                  </label>
                );
              })}
            </div>
          </>
        );
        return (
          <div className={itemClass} data-invalid={error ? "true" : undefined} key={item.itemId}>
            {mode === "family" ? <div className={styles.familyMatrixRow}>{content}</div> : content}
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

function MatrixScaleField({
  answer,
  errors,
  onChange,
  question,
  sectionKey,
}: {
  answer: SurveyAnswerDraft | undefined;
  errors: SurveyValidationErrors;
  onChange: (answer: SurveyAnswerDraft) => void;
  question: Extract<SurveyQuestion, { type: "MATRIX_SCALE" }>;
  sectionKey: string;
}) {
  const itemAnswers = answer?.type === question.type ? answer.itemAnswers : {};
  return (
    <div className={styles.affectiveDistanceMatrix}>
      {question.items.map((item) => {
        const controlId = `survey-question-${sectionKey}-${question.questionKey}-${item.itemKey}`;
        const labelId = `${controlId}-label`;
        const errorId = `${controlId}-error`;
        const error = errors[surveyAnswerErrorKey(question.questionId, item.itemId)];
        const value = itemAnswers[item.itemId];
        return (
          <div
            className={styles.affectiveDistanceItem}
            data-invalid={error ? "true" : undefined}
            key={item.itemId}
          >
            <p className={styles.affectiveDistanceLabel} id={labelId}>
              {item.itemLabel}
            </p>
            <div
              aria-describedby={error ? errorId : undefined}
              aria-labelledby={labelId}
              className={styles.affectiveDistanceOptions}
              id={controlId}
              role="radiogroup"
            >
              {numberRange(question.minimum, question.maximum).map((scale) => (
                <label className={styles.affectiveDistanceOption} key={scale}>
                  <input
                    checked={value === scale}
                    name={controlId}
                    onChange={() =>
                      onChange({
                        type: "MATRIX_SCALE",
                        itemAnswers: { ...itemAnswers, [item.itemId]: scale },
                      })
                    }
                    onKeyDown={selectRadioOnEnter}
                    type="radio"
                    value={scale}
                  />
                  <span>{scale}</span>
                </label>
              ))}
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

function selectRadioOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.currentTarget.click();
}

function SurveyQuestionControl({
  answer,
  controlId,
  describedBy,
  onChange,
  question,
}: {
  answer: SurveyAnswerDraft | undefined;
  controlId: string;
  describedBy: string | undefined;
  onChange: (answer: SurveyAnswerDraft) => void;
  question: Exclude<SurveyQuestion, { type: "MATRIX_SINGLE_CHOICE" | "MATRIX_SCALE" }>;
}) {
  if (question.questionKey === RESIDENCE_KEY && question.type === "SHORT_TEXT") {
    return (
      <ResidenceTextInputs
        answer={answer}
        controlId={controlId}
        describedBy={describedBy}
        maxLength={question.maxLength}
        onChange={onChange}
      />
    );
  }

  switch (question.type) {
    case "SINGLE_CHOICE": {
      const selection = answer?.type === question.type ? answer.selection : null;
      return (
        <SurveySelect
          ariaDescribedBy={describedBy}
          ariaLabel={question.prompt}
          id={controlId}
          onChange={(optionId) => onChange({ type: question.type, selection: { optionId } })}
          options={question.options.map((option) => ({
            value: option.optionId,
            label: option.label,
          }))}
          value={selection?.optionId ?? null}
        />
      );
    }
    case "MULTIPLE_CHOICE": {
      const selections = answer?.type === question.type ? answer.selections : [];
      return (
        <SurveyMultiSelect
          ariaDescribedBy={describedBy}
          ariaLabel={question.prompt}
          id={controlId}
          onChange={(optionIds) =>
            onChange({
              type: question.type,
              selections: optionIds.map((optionId) => ({ optionId })),
            })
          }
          options={question.options.map((option) => ({
            value: option.optionId,
            label: option.label,
          }))}
          values={selections.map((selection) => selection.optionId)}
        />
      );
    }
    case "SHORT_TEXT":
    case "LONG_TEXT": {
      const value = answer?.type === question.type ? answer.text : "";
      const commonProps = {
        "aria-describedby": describedBy,
        "aria-label": question.prompt,
        className: styles.textControl,
        id: controlId,
        maxLength: question.maxLength ?? undefined,
        onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          onChange({ type: question.type, text: event.target.value }),
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
        const values = numberRange(question.minimum!, question.maximum!);
        if (question.questionKey === BIRTH_YEAR_KEY) values.reverse();
        return (
          <SurveySelect
            ariaDescribedBy={describedBy}
            ariaLabel={question.prompt}
            id={controlId}
            onChange={(selectedValue) =>
              onChange({ type: question.type, number: Number(selectedValue) })
            }
            optionLabelMode="plain"
            options={values.map((number) => ({ value: String(number), label: String(number) }))}
            placeholder={question.questionKey === BIRTH_YEAR_KEY ? "YYYY" : "선택"}
            value={value === null ? null : String(value)}
          />
        );
      }
      return (
        <input
          aria-describedby={describedBy}
          aria-label={question.prompt}
          className={styles.textControl}
          id={controlId}
          inputMode={question.decimalScale === 0 ? "numeric" : "decimal"}
          max={question.maximum ?? undefined}
          min={question.minimum ?? undefined}
          onChange={(event) =>
            onChange({
              type: question.type,
              number: event.target.value === "" ? null : event.target.valueAsNumber,
            })
          }
          step={question.decimalScale === 0 ? 1 : 1 / 10 ** question.decimalScale}
          type="number"
          value={value ?? ""}
        />
      );
    }
    case "SCALE": {
      const value = answer?.type === question.type ? answer.scale : null;
      return (
        <fieldset aria-describedby={describedBy} className={styles.scaleField} id={controlId}>
          <legend className={styles.visuallyHidden}>{question.prompt}</legend>
          <div className={styles.scaleOptions}>
            {numberRange(question.minimum, question.maximum).map((scale) => (
              <label className={styles.scaleOption} key={scale}>
                <input
                  checked={value === scale}
                  name={controlId}
                  onChange={() => onChange({ type: question.type, scale })}
                  type="radio"
                />
                <span>{scale}</span>
              </label>
            ))}
          </div>
          <div className={styles.scaleLabels}>
            <span>{question.minimumLabel}</span>
            <span>{question.maximumLabel}</span>
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
  const values =
    answer?.type === "SHORT_TEXT" && answer.inputSegments
      ? [...answer.inputSegments]
      : ["", "", ""];
  const placeholders = ["시/도", "시/군/구", "읍/면/동"];
  return (
    <div className={styles.residenceFields}>
      {placeholders.map((placeholder, index) => (
        <input
          aria-describedby={describedBy}
          aria-label={`주소지 ${placeholder}`}
          className={styles.textControl}
          id={index === 0 ? controlId : undefined}
          key={placeholder}
          maxLength={maxLength ?? undefined}
          onChange={(event) => {
            const next = [...values];
            next[index] = event.target.value;
            onChange({
              type: "SHORT_TEXT",
              inputSegments: next,
              text: next
                .map((value) => value.trim())
                .filter(Boolean)
                .join(" "),
            });
          }}
          placeholder={placeholder}
          type="text"
          value={values[index] ?? ""}
        />
      ))}
    </div>
  );
}

function canRenderNumberSelect(question: Extract<SurveyQuestion, { type: "NUMBER" }>): boolean {
  return (
    question.decimalScale === 0 &&
    question.minimum !== null &&
    question.maximum !== null &&
    question.maximum - question.minimum <= 200
  );
}

function numberRange(minimum: number, maximum: number): number[] {
  return Array.from({ length: Math.max(0, maximum - minimum + 1) }, (_, index) => minimum + index);
}
