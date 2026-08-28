"use client";

import { useReducer } from "react";
import { publicRoomSearchQuerySchema } from "@/lib/chat/chat-room-contracts";

export const PUBLIC_ROOM_SEARCH_APPLY_MODE = "submit" as const;
export const PUBLIC_ROOM_SEARCH_DEBOUNCE_DELAY_MS = 300;

export type PublicRoomSearchState = Readonly<{
  appliedQuery: string | undefined;
  draftQuery: string;
  isComposing: boolean;
  validationMessage: string | undefined;
}>;

export type PublicRoomSearchAction =
  | Readonly<{ type: "draft-changed"; value: string }>
  | Readonly<{ type: "composition-started" }>
  | Readonly<{ type: "composition-ended" }>
  | Readonly<{ type: "submitted" }>;

export type PublicRoomSearchController = PublicRoomSearchState &
  Readonly<{
    applySearch: () => void;
    endComposition: () => void;
    setDraftQuery: (value: string) => void;
    startComposition: () => void;
  }>;

export const INITIAL_PUBLIC_ROOM_SEARCH_STATE: PublicRoomSearchState = {
  appliedQuery: undefined,
  draftQuery: "",
  isComposing: false,
  validationMessage: undefined,
};

export function reducePublicRoomSearchState(
  state: PublicRoomSearchState,
  action: PublicRoomSearchAction,
): PublicRoomSearchState {
  switch (action.type) {
    case "draft-changed":
      return {
        ...state,
        draftQuery: action.value,
        validationMessage: undefined,
      };
    case "composition-started":
      return {
        ...state,
        isComposing: true,
      };
    case "composition-ended":
      return {
        ...state,
        isComposing: false,
      };
    case "submitted": {
      if (state.isComposing) {
        return state;
      }

      const parsed = publicRoomSearchQuerySchema.safeParse(state.draftQuery);

      if (!parsed.success) {
        return {
          ...state,
          validationMessage:
            parsed.error.issues[0]?.message ?? "검색어는 100자 이내로 입력해 주세요.",
        };
      }

      return {
        ...state,
        appliedQuery: parsed.data,
        validationMessage: undefined,
      };
    }
  }
}

export function usePublicRoomSearch(): PublicRoomSearchController {
  const [state, dispatch] = useReducer(
    reducePublicRoomSearchState,
    INITIAL_PUBLIC_ROOM_SEARCH_STATE,
  );

  return {
    ...state,
    applySearch: () => dispatch({ type: "submitted" }),
    endComposition: () => dispatch({ type: "composition-ended" }),
    setDraftQuery: (value: string) => dispatch({ type: "draft-changed", value }),
    startComposition: () => dispatch({ type: "composition-started" }),
  };
}
