# Task Result for LLM export v1

## Purpose

Expose a finalized Task result to the AI Runtime without granting an admin scope
or disclosing participant identity, prediction provenance, or submission timing.

## Endpoint

```http
GET /api/v1/integrations/llm/tasks/{taskId}/result-export
Authorization: Bearer <ai-runtime-shared-token>
Accept: application/x-ndjson
```

The endpoint returns `404 TASK_RESULT_FOR_LLM_NOT_FOUND` until the Task result
manifest has been finalized. A manifest integrity failure returns the existing
sanitized `500 TASK_RESULT_VIEW_INTEGRITY_FAILURE` problem response.

`resultVersion` identifies the immutable source Result revision for the Task.
It is distinct from `schemaVersion`, which versions the export contract. The
current Result finalizer emits revision `1`; retaining the field lets a future
corrected or re-finalized result be correlated without reinterpreting this
contract.

`closedAt` is deliberately omitted. Result finalization already requires a
result-eligible closed Task, and the timestamp does not contribute to the LLM's
qualitative analysis.

Successful responses use:

- `Content-Type: application/x-ndjson;charset=UTF-8`
- `Cache-Control: no-store`
- `ETag`: SHA-256 of the export body after the manifest line
- `Content-Disposition`: task-title-based `.jsonl` attachment name
- `X-Export-Schema-Version: task-result-for-llm/v1`
- `X-Source-Result-SHA256`: SHA-256 of the canonical Task Result View body

The endpoint uses the existing `VOTE_AI_RUNTIME_AUTH_TOKEN` shared-token
authentication boundary. OAuth/JWT admin scopes are not accepted on this path.

## Contract

The byte-stable golden example is
`src/test/resources/contracts/task-result-for-llm-v1.jsonl`.

A complete 100-response example projected from the SONA simulation spreadsheet
is available at
`docs/examples/task-result-for-llm-v1/sona-simulation-results.jsonl`; its
example-only metadata is documented in the adjacent `README.md`.

Lines are emitted in this order:

1. `manifest`
2. `task`
3. `question`
4. `option` lines in display order
5. `response` lines in canonical Result View participant order

Each response contains only:

```json
{
  "type": "response",
  "responseRef": "R1",
  "selectedOptionKey": "O2",
  "reason": "The participant's final reason"
}
```

`responseRef` is stable only within this immutable export. It is not a user or
Submission identifier.

## Excluded data

The export deliberately excludes:

- `reasonSource`
- prediction candidates and accepted prediction identifiers
- user, Persona, Submission, and Prediction identifiers
- submission timestamps

Prompt templates, provider model settings, and qualitative-summary output are
separate contracts and are not part of this export.
