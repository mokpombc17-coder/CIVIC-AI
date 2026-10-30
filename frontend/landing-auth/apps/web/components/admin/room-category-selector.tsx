"use client";

import type { RoomCategory } from "@/lib/admin/room-category-contracts";

export function RoomCategorySelector({
  categories,
  disabled,
  legend,
  onChange,
  selectedCategoryIds,
}: Readonly<{
  categories: readonly RoomCategory[];
  disabled: boolean;
  legend: string;
  onChange: (categoryIds: readonly string[]) => void;
  selectedCategoryIds: readonly string[];
}>) {
  return (
    <fieldset className="civic-category-selector-fieldset">
      <legend>{legend}</legend>
      <div className="civic-category-selector">
        {categories.map((category) => {
          const checked = selectedCategoryIds.includes(category.categoryId);
          return (
            <label key={category.categoryId}>
              <input
                checked={checked}
                disabled={disabled || (!checked && selectedCategoryIds.length >= 5)}
                onChange={(event) =>
                  onChange(
                    event.currentTarget.checked
                      ? [...selectedCategoryIds, category.categoryId]
                      : selectedCategoryIds.filter((id) => id !== category.categoryId),
                  )
                }
                type="checkbox"
              />
              <span>{category.name}</span>
            </label>
          );
        })}
        {categories.length === 0 ? <p>선택할 수 있는 카테고리가 없습니다.</p> : null}
      </div>
      <small>{selectedCategoryIds.length} / 5개 선택</small>
    </fieldset>
  );
}
