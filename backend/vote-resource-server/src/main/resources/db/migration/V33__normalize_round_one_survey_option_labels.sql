UPDATE survey_options AS survey_option
SET label = correction.new_label
FROM survey_questions AS question,
     (VALUES
          ('socioeconomic.household-income', 2,
           '연간 1천만원 이상~3천만원 미만',
           '연간 1천만원 이상 ~ 3천만원 미만'),
          ('socioeconomic.household-income', 3,
           '연간 3천만원 이상~5천만원 미만',
           '연간 3천만원 이상 ~ 5천만원 미만'),
          ('socioeconomic.household-income', 4,
           '연간 5천만원 이상~7천만원 미만',
           '연간 5천만원 이상 ~ 7천만원 미만'),
          ('socioeconomic.household-income', 5,
           '연간 7천만원 이상~1억원 미만',
           '연간 7천만원 이상 ~ 1억원 미만'),
          ('demographics.religion', 3,
           '천주교(카톨릭)',
           '천주교(가톨릭)'),
          ('media.daily-use-duration', 1,
           '시청안함',
           '시청 안 함'),
          ('media.daily-use-duration', 3,
           '1시간 이상~3시간 미만',
           '1시간 이상 ~ 3시간 미만'),
          ('media.sns-use-frequency', 2,
           '주 5~6회',
           '주 5 ~ 6회'),
          ('media.sns-use-frequency', 3,
           '주 3~4회',
           '주 3 ~ 4회'),
          ('media.sns-use-frequency', 4,
           '주 1~2회',
           '주 1 ~ 2회'),
          ('media.sns-use-frequency', 5,
           '월 2~3회',
           '월 2 ~ 3회'),
          ('media.ott-daily-duration', 1,
           '시청안함',
           '시청 안 함'),
          ('media.ott-daily-duration', 3,
           '1시간 이상~3시간 미만',
           '1시간 이상 ~ 3시간 미만')
     ) AS correction(question_key, display_order, old_label, new_label)
WHERE question.question_id = survey_option.question_id
  AND question.content_version_id = survey_option.content_version_id
  AND question.question_key = correction.question_key
  AND survey_option.display_order = correction.display_order
  AND survey_option.label = correction.old_label;
