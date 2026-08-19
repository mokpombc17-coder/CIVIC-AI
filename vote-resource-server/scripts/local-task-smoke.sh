#!/usr/bin/env bash
set -euo pipefail

API_BASE="${VOTE_LOCAL_API_BASE:-http://127.0.0.1:8083}"
JWT_SECRET="${VOTE_LOCAL_JWT_SECRET:-civic-ai-local-auth-fixture-signing-key-v1-public-do-not-use-in-production}"
JWT_ISSUER="${VOTE_LOCAL_JWT_ISSUER:-http://localhost:3000/api/dev/auth}"
JWT_AUDIENCE="${VOTE_LOCAL_JWT_AUDIENCE:-civic-ai-api}"
TASK_ID="13000000-0000-0000-0000-000000000001"
SURVEY_KEY="13050000-0000-0000-0000-000000000001"
SUBMISSION_KEY="13050000-0000-0000-0000-000000000002"

for command in curl python3; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "$command is required" >&2
    exit 1
  }
done

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

token="$(JWT_SECRET="$JWT_SECRET" JWT_ISSUER="$JWT_ISSUER" \
  JWT_AUDIENCE="$JWT_AUDIENCE" python3 - <<'PY'
import base64
import hashlib
import hmac
import json
import os
import time

def encode(value):
    raw = json.dumps(value, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

now = int(time.time())
header = encode({"alg": "HS256", "typ": "JWT"})
payload = encode({
    "iss": os.environ["JWT_ISSUER"],
    "aud": [os.environ["JWT_AUDIENCE"]],
    "sub": "local-task-smoke-user",
    "iat": now,
    "exp": now + 3600,
    "scope": " ".join([
        "vote:surveys:read",
        "vote:survey-responses:write",
        "vote:personas:read",
        "vote:tasks:read",
        "vote:predictions:write",
        "vote:submissions:read",
        "vote:submissions:write",
    ]),
})
signing_input = f"{header}.{payload}".encode()
signature = base64.urlsafe_b64encode(hmac.new(
    os.environ["JWT_SECRET"].encode(),
    signing_input,
    hashlib.sha256,
).digest()).rstrip(b"=").decode()
print(f"{header}.{payload}.{signature}")
PY
)"

auth=(-H "Authorization: Bearer $token")

healthy=false
for _ in $(seq 1 60); do
  if curl --fail --silent --show-error \
      "$API_BASE/actuator/health" >"$work_dir/health.json" 2>/dev/null; then
    healthy=true
    break
  fi
  sleep 0.5
done
[[ "$healthy" == "true" ]] || {
  echo "local vote-resource-server is not healthy: $API_BASE" >&2
  exit 1
}

curl --fail --silent --show-error "${auth[@]}" \
  "$API_BASE/api/v1/me/surveys/current" \
  >"$work_dir/survey.json"

submitted="$(python3 - "$work_dir/survey.json" <<'PY'
import json
import sys
print(str(json.load(open(sys.argv[1]))["submitted"]).lower())
PY
)"

if [[ "$submitted" != "true" ]]; then
  python3 - "$work_dir/survey.json" "$work_dir/survey-submit.json" <<'PY'
import json
import sys

survey = json.load(open(sys.argv[1]))
answers = []
for question in survey["content"]["questions"]:
    answer = {"questionId": question["id"], "type": question["type"]}
    kind = question["type"]
    rule = question["rule"]
    standard = [
        option for option in question["options"]
        if option["kind"] == "STANDARD"
    ]
    if kind == "SINGLE_CHOICE":
        answer["selection"] = {"optionId": standard[0]["id"]}
    elif kind == "MULTIPLE_CHOICE":
        count = rule["minimumSelections"]
        answer["selections"] = [
            {"optionId": option["id"]} for option in standard[:count]
        ]
    elif kind == "SHORT_TEXT":
        answer["text"] = "활기찬 동네"
    elif kind == "LONG_TEXT":
        answer["text"] = "생활 편의 시설과 안전한 보행 환경을 중요하게 생각합니다."
    elif kind == "NUMBER":
        answer["number"] = rule["minimum"]
    elif kind == "SCALE":
        answer["scale"] = int(rule["minimum"])
    answers.append(answer)

json.dump(
    {"roundId": survey["round"]["id"], "answers": answers},
    open(sys.argv[2], "w"),
    separators=(",", ":"),
)
PY
  curl --fail --silent --show-error "${auth[@]}" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $SURVEY_KEY" \
    --data-binary "@$work_dir/survey-submit.json" \
    "$API_BASE/api/v1/me/survey-responses" \
    >"$work_dir/survey-result.json"
fi

persona_ready=false
for _ in $(seq 1 30); do
  curl --fail --silent --show-error "${auth[@]}" \
    "$API_BASE/api/v1/me/persona-status" \
    >"$work_dir/persona.json"
  persona_ready="$(python3 - "$work_dir/persona.json" <<'PY'
import json
import sys
print(str(json.load(open(sys.argv[1]))["personaReady"]).lower())
PY
)"
  [[ "$persona_ready" == "true" ]] && break
  sleep 0.5
done
[[ "$persona_ready" == "true" ]] || {
  echo "local persona did not become ready" >&2
  exit 1
}

curl --fail --silent --show-error "${auth[@]}" \
  "$API_BASE/api/v1/me/tasks" >"$work_dir/tasks.json"

already_submitted="$(python3 - "$work_dir/tasks.json" "$TASK_ID" <<'PY'
import json
import sys
task = next(item for item in json.load(open(sys.argv[1])) if item["taskId"] == sys.argv[2])
print(str(task["submission"]["submitted"]).lower())
PY
)"

if [[ "$already_submitted" != "true" ]]; then
  curl --fail --silent --show-error "${auth[@]}" -X POST \
    "$API_BASE/api/v1/me/tasks/$TASK_ID/prediction" \
    >"$work_dir/prediction-ensure.json"

  prediction_status=""
  for _ in $(seq 1 30); do
    curl --fail --silent --show-error "${auth[@]}" \
      "$API_BASE/api/v1/me/tasks/$TASK_ID/prediction" \
      >"$work_dir/prediction.json"
    prediction_status="$(python3 - "$work_dir/prediction.json" <<'PY'
import json
import sys
print(json.load(open(sys.argv[1])).get("predictionStatus") or "")
PY
)"
    [[ "$prediction_status" == "SUCCEEDED" ]] && break
    [[ "$prediction_status" == "FAILED" ]] && break
    sleep 0.5
  done
  [[ "$prediction_status" == "SUCCEEDED" ]] || {
    echo "local prediction ended with status: $prediction_status" >&2
    exit 1
  }

  python3 - "$work_dir/prediction.json" "$work_dir/task-submit.json" <<'PY'
import json
import sys

prediction = json.load(open(sys.argv[1]))
first_by_question = {}
for candidate in prediction["candidates"]:
    first_by_question.setdefault(candidate["questionId"], candidate)
answers = [
    {
        "questionId": question_id,
        "source": "AI_ACCEPTED",
        "candidateId": candidate["id"],
    }
    for question_id, candidate in first_by_question.items()
]
json.dump(
    {"predictionId": prediction["predictionId"], "answers": answers},
    open(sys.argv[2], "w"),
    separators=(",", ":"),
)
PY
  curl --fail --silent --show-error "${auth[@]}" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $SUBMISSION_KEY" \
    --data-binary "@$work_dir/task-submit.json" \
    "$API_BASE/api/v1/me/tasks/$TASK_ID/submission" \
    >"$work_dir/submission.json"
fi

curl --fail --silent --show-error "${auth[@]}" \
  "$API_BASE/api/v1/me/submissions?taskId=$TASK_ID" \
  >"$work_dir/submission-result.json"

python3 - "$work_dir/submission-result.json" <<'PY'
import json
import sys
submission = json.load(open(sys.argv[1]))
print("local Task smoke passed")
print("taskId=" + submission["taskId"])
print("submissionId=" + submission["submissionId"])
print("answers=" + str(len(submission["answers"])))
PY
