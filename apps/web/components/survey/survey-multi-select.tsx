"use client";

import { useCallback, useId, useRef, useState, type KeyboardEvent } from "react";
import { SurveyDropdownSurface, SurveyOptionContent, useSurveyDropdown } from "./survey-dropdown";
import type { SurveySelectOption } from "./survey-select";
import styles from "./survey.module.css";

export function SurveyMultiSelect({
  ariaDescribedBy,
  ariaLabel,
  id,
  onChange,
  options,
  placeholder = "복수 선택",
  values,
}: {
  ariaDescribedBy?: string | undefined;
  ariaLabel: string;
  id: string;
  onChange: (values: string[]) => void;
  options: readonly SurveySelectOption[];
  placeholder?: string;
  values: readonly string[];
}) {
  const generatedId = useId();
  const menuId = `${id}-${generatedId.replaceAll(":", "")}-menu`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const closeMenu = useCallback(() => setIsOpen(false), []);
  const { closeWhenFocusLeaves, menuRef, placement, rootRef } = useSurveyDropdown(
    isOpen,
    closeMenu,
  );
  const selectedOptions = options.filter((option) => values.includes(option.value));
  const fullSummary = selectedOptions.map((option) => option.label).join(", ");
  const summary = createSelectionSummary(
    selectedOptions.map((option) => option.label),
    placeholder,
  );

  function openMenu() {
    setIsOpen(true);
  }

  function focusAdjacentOption(target: EventTarget | null, direction: 1 | -1) {
    const optionInputs = Array.from(
      menuRef.current?.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][data-option-index]:not(:disabled)',
      ) ?? [],
    );
    if (optionInputs.length === 0) return;

    const currentIndex = optionInputs.findIndex((input) => input === target);
    const nextIndex =
      currentIndex < 0
        ? direction === 1
          ? 0
          : optionInputs.length - 1
        : (currentIndex + direction + optionInputs.length) % optionInputs.length;
    optionInputs[nextIndex]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        if (isOpen) focusAdjacentOption(event.target, direction);
        else {
          openMenu();
          requestAnimationFrame(() => focusAdjacentOption(null, direction));
        }
        break;
      }
      case "Enter":
        if (!(event.target instanceof HTMLInputElement) || event.target.type !== "checkbox") return;
        event.preventDefault();
        event.target.click();
        break;
      case "Escape":
        if (!isOpen) return;
        event.preventDefault();
        closeMenu();
        triggerRef.current?.focus();
        break;
    }
  }

  return (
    <div
      className={styles.multiSelect}
      onBlur={closeWhenFocusLeaves}
      onKeyDown={handleKeyDown}
      ref={rootRef}
    >
      <button
        aria-controls={menuId}
        aria-describedby={ariaDescribedBy}
        aria-expanded={isOpen}
        aria-label={`${ariaLabel} 복수 선택`}
        className={styles.selectControl}
        data-empty={selectedOptions.length === 0 ? "true" : undefined}
        data-open={isOpen ? "true" : undefined}
        id={id}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        ref={triggerRef}
        type="button"
      >
        <span
          className={styles.selectValue}
          title={selectedOptions.length > 0 ? fullSummary : undefined}
        >
          {summary}
        </span>
        <span aria-hidden="true" className={styles.selectChevron} />
      </button>
      <SurveyDropdownSurface
        className={styles.multiSelectMenu}
        id={menuId}
        isOpen={isOpen}
        placement={placement}
        ref={menuRef}
        role="group"
      >
        <fieldset aria-label={`${ariaLabel} 선택지`} className={styles.multiSelectOptions}>
          {options.map((option, index) => {
            const checked = values.includes(option.value);
            return (
              <label
                className={styles.multiSelectOption}
                data-selected={checked ? "true" : undefined}
                key={option.value}
                onMouseDown={(event) => event.preventDefault()}
              >
                <input
                  checked={checked}
                  data-option-index={index}
                  disabled={option.disabled}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...values, option.value]
                        : values.filter((value) => value !== option.value),
                    )
                  }
                  tabIndex={-1}
                  type="checkbox"
                />
                <SurveyOptionContent index={index} label={option.label} labelMode="plain" />
              </label>
            );
          })}
        </fieldset>
      </SurveyDropdownSurface>
    </div>
  );
}

export function createSelectionSummary(labels: readonly string[], placeholder: string): string {
  if (labels.length === 0) return placeholder;
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} 외 ${labels.length - 2}개`;
}
