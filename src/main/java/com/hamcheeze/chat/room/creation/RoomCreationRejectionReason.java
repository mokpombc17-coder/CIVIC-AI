package com.hamcheeze.chat.room.creation;

public final class RoomCreationRejectionReason {

    public static final int MAX_CODE_POINTS = 100;

    private RoomCreationRejectionReason() {
    }

    public static String canonicalize(String value) {
        return value == null ? null : value.strip();
    }

    public static boolean isValid(String value) {
        String canonical = canonicalize(value);
        if (canonical == null || canonical.isEmpty()) {
            return false;
        }
        if (canonical.codePointCount(0, canonical.length())
                > MAX_CODE_POINTS) {
            return false;
        }
        for (int offset = 0; offset < canonical.length();) {
            int codePoint = canonical.codePointAt(offset);
            int type = Character.getType(codePoint);
            if (Character.isISOControl(codePoint)
                    || type == Character.LINE_SEPARATOR
                    || type == Character.PARAGRAPH_SEPARATOR) {
                return false;
            }
            offset += Character.charCount(codePoint);
        }
        return true;
    }

    public static String requireValid(String value) {
        String canonical = canonicalize(value);
        if (!isValid(canonical)) {
            throw new IllegalArgumentException(
                    "rejectionReason must be a single line "
                            + "between 1 and 100 characters");
        }
        return canonical;
    }
}
