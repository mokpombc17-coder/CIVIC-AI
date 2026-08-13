ALTER TABLE survey_rounds
    DROP CONSTRAINT fk_survey_round_closed_by;

ALTER TABLE survey_rounds
    ADD CONSTRAINT fk_survey_round_closed_by
        FOREIGN KEY (closed_by_round_id)
        REFERENCES survey_rounds (round_id)
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED;
