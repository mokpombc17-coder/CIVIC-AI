package com.hamcheeze.vote.task.application.port.out;

import com.hamcheeze.vote.task.application.prediction.PredictionCreationCommand;
import com.hamcheeze.vote.task.application.prediction.PredictionCreationResult;

public interface PredictionCreationPort {

    PredictionCreationResult create(PredictionCreationCommand command);
}
