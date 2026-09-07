package com.hamcheeze.vote.task.application.research;

import com.hamcheeze.vote.task.domain.common.TaskId;

import java.util.List;

public interface ResearchTaskExportDataReader {

    List<ResearchTaskExportParticipant> findParticipants(TaskId taskId);
}
