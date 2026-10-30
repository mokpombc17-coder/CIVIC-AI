package com.hamcheeze.vote.task.api;

import org.junit.jupiter.api.Test;
import org.springframework.http.ContentDisposition;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class TaskDownloadFileNameTest {

    private static final UUID TASK_ID = UUID.fromString(
            "11111111-1111-1111-1111-111111111111");

    @Test
    void usesTaskTitleAndResultSuffix() {
        assertThat(TaskDownloadFileName.result(
                "지역 공공도서관 운영 시간 확대",
                TASK_ID,
                "jsonl"))
                .isEqualTo("지역 공공도서관 운영 시간 확대_결과.jsonl");
    }

    @Test
    void sanitizesUnsafeFileNameCharacters() {
        assertThat(TaskDownloadFileName.result(
                "  주민 / 의견\n수렴?  ", TASK_ID, "zip"))
                .isEqualTo("주민_의견_수렴_결과.zip");
    }

    @Test
    void fallsBackToTaskIdWhenSanitizedTitleIsEmpty() {
        assertThat(TaskDownloadFileName.result(
                " /:*? ", TASK_ID, "zip"))
                .isEqualTo("task-" + TASK_ID + "_결과.zip");
    }

    @Test
    void limitsLongTitleByUtf8ByteLength() {
        String fileName = TaskDownloadFileName.result(
                "가".repeat(100), TASK_ID, "zip");

        assertThat(fileName)
                .isEqualTo("가".repeat(60) + "_결과.zip");
        assertThat(fileName.getBytes(StandardCharsets.UTF_8).length)
                .isLessThanOrEqualTo(255);
    }

    @Test
    void encodesKoreanFileNameInContentDisposition() {
        ContentDisposition disposition =
                TaskDownloadFileName.resultAttachment(
                        "지역 공공도서관", TASK_ID, "zip");

        assertThat(ContentDisposition.parse(disposition.toString())
                .getFilename())
                .isEqualTo("지역 공공도서관_결과.zip");
    }
}
