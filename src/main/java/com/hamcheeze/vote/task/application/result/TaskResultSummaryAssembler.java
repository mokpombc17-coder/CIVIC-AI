package com.hamcheeze.vote.task.application.result;

import com.hamcheeze.vote.task.application.result.TaskResultSummaryV1.OptionCount;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.OptionData;
import com.hamcheeze.vote.task.application.result.TaskResultViewV1.ResponseData;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

@Component
public class TaskResultSummaryAssembler {

    public TaskResultSummaryV1 assemble(TaskResultViewV1 view) {
        Objects.requireNonNull(view, "view");
        int[] counts = new int[view.options().size()];
        for (ResponseData response : view.responses()) {
            counts[response.selectedOptionDisplayOrder() - 1]++;
        }

        List<OptionCount> options = new ArrayList<>(view.options().size());
        for (int index = 0; index < view.options().size(); index++) {
            OptionData option = view.options().get(index);
            options.add(new OptionCount(
                    optionKey(option.displayOrder()),
                    option.content(),
                    counts[index]));
        }
        return new TaskResultSummaryV1(
                TaskResultSummaryV1.SCHEMA_VERSION,
                view.resultVersion(),
                view.responses().size(),
                options);
    }

    private static String optionKey(int displayOrder) {
        return "O" + displayOrder;
    }
}
