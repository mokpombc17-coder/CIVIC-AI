# SONA simulation example

`sona-simulation-results.jsonl` is a complete 100-response example derived from
the `전체 결과` sheet in `/Users/junseok/Downloads/sona-simulation-results.xlsx`.

The spreadsheet columns are projected as follows:

- the first line of `상황` becomes `task.title`
- the remainder of `상황` becomes `task.background`
- `질문` becomes `question.content`
- the ordered `선택지` values become `O1` through `O3`
- spreadsheet row order becomes the export-local `R1` through `R100`
- `페르소나 선택` becomes `selectedOptionKey`
- `선택 이유` becomes `reason`

Because the source is a standalone spreadsheet rather than a finalized Result
View fetched from the service, two manifest fields use explicit example values:

- `taskId` is the all-zero UUID.
- `sourceBodySha256` is 64 zeroes.

`bodySha256` is not a placeholder; it is the SHA-256 of every JSONL line after
the manifest, including each trailing newline.

`closedAt` is intentionally absent from the v1 contract. Availability of this
export already means that the Task Result has been finalized after the Task
became result-eligible.
