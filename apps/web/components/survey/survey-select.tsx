"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import styles from "./survey.module.css";

export type SurveySelectOption = Readonly<{
  value: string;
  label: string;
  disabled?: boolean;
}>;

export function SurveySelect({
  ariaDescribedBy,
  ariaLabel,
  id,
  onChange,
  options,
  placeholder = "선택",
  value,
}: {
  ariaDescribedBy?: string | undefined;
  ariaLabel: string;
  id: string;
  onChange: (value: string) => void;
  options: readonly SurveySelectOption[];
  placeholder?: string;
  value: string | null;
}) {
  const generatedId = useId();
  const listboxId = `${id}-${generatedId.replaceAll(":", "")}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    selectedIndex >= 0 ? selectedIndex : findEnabledOption(options, 0, 1),
  );
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    listboxRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen]);

  function openMenu(preferredIndex = selectedIndex) {
    const nextIndex =
      preferredIndex >= 0 && !options[preferredIndex]?.disabled
        ? preferredIndex
        : findEnabledOption(options, 0, 1);
    setActiveIndex(nextIndex);
    setIsOpen(true);
  }

  function selectOption(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setActiveIndex(index);
    setIsOpen(false);
  }

  function moveActive(direction: 1 | -1) {
    if (options.length === 0) return;
    const start =
      activeIndex >= 0 ? activeIndex + direction : direction === 1 ? 0 : options.length - 1;
    setActiveIndex(findEnabledOption(options, start, direction));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (isOpen) moveActive(1);
        else openMenu();
        break;
      case "ArrowUp":
        event.preventDefault();
        if (isOpen) moveActive(-1);
        else openMenu(selectedIndex >= 0 ? selectedIndex : options.length - 1);
        break;
      case "Home":
        if (!isOpen) return;
        event.preventDefault();
        setActiveIndex(findEnabledOption(options, 0, 1));
        break;
      case "End":
        if (!isOpen) return;
        event.preventDefault();
        setActiveIndex(findEnabledOption(options, options.length - 1, -1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (isOpen) selectOption(activeIndex);
        else openMenu();
        break;
      case "Escape":
        if (!isOpen) return;
        event.preventDefault();
        setIsOpen(false);
        break;
      case "Tab":
        setIsOpen(false);
        break;
    }
  }

  return (
    <div
      className={styles.customSelect}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
      ref={rootRef}
    >
      <button
        aria-activedescendant={
          isOpen && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        aria-controls={listboxId}
        aria-describedby={ariaDescribedBy}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={styles.selectControl}
        data-empty={selectedOption ? undefined : "true"}
        data-open={isOpen ? "true" : undefined}
        id={id}
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
        role="combobox"
        type="button"
      >
        <span className={styles.selectValue} title={selectedOption?.label}>
          {selectedOption?.label ?? placeholder}
        </span>
        <span aria-hidden="true" className={styles.selectChevron} />
      </button>
      {isOpen ? (
        <div className={styles.selectMenu} id={listboxId} ref={listboxRef} role="listbox">
          {options.map((option, index) => (
            <button
              aria-selected={option.value === value}
              className={styles.selectOption}
              data-active={index === activeIndex ? "true" : undefined}
              data-option-index={index}
              disabled={option.disabled}
              id={`${listboxId}-option-${index}`}
              key={option.value}
              onClick={() => selectOption(index)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              tabIndex={-1}
              type="button"
            >
              <span>{option.label}</span>
              {option.value === value ? (
                <span aria-hidden="true" className={styles.selectOptionCheck} />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function findEnabledOption(
  options: readonly SurveySelectOption[],
  start: number,
  direction: 1 | -1,
): number {
  for (let offset = 0; offset < options.length; offset += 1) {
    const index = (start + offset * direction + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return -1;
}
