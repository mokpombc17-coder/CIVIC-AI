# Listed Room query executionStats

Measurement date: 2026-08-06

## Purpose

Record the initial cost of the public Room search and filter query before
adding any search-specific compound index. These values are local MongoDB
`executionStats`, not HTTP latency or CI performance thresholds.

## Environment and method

- Isolated database: `chat_query_benchmark`
- MongoDB: 7.0.14 (local Docker Compose)
- Collection: `chat_rooms`
- Page size: 20 (`limit + 1` observes up to 21 documents)
- Query maximum execution time: 1 second
- Sort: `_id ASC`
- Existing index:
  `ix_chat_room_status_visibility_cursor`
  (`status`, `visibility`, `_id`)
- Fixture sizes: 100, 1,000, and 10,000 `ACTIVE + LISTED` Rooms

The fixture and explain scripts are:

- `scripts/listed-room-query-load.js`
- `scripts/listed-room-query-explain.js`

## Results

Every scenario used `ix_chat_room_status_visibility_cursor` and none produced
a blocking sort.

| Rooms | Scenario | Keys examined | Docs examined | Time (ms) | Returned |
| ---: | --- | ---: | ---: | ---: | ---: |
| 100 | unfiltered | 21 | 21 | 0 | 21 |
| 100 | `joinPolicy=OPEN` | 41 | 41 | 0 | 21 |
| 100 | `category=POLICY` | 61 | 61 | 0 | 21 |
| 100 | one-character, many results | 21 | 21 | 0 | 21 |
| 100 | two-character, some results | 100 | 100 | 5 | 5 |
| 100 | no search result | 100 | 100 | 4 | 0 |
| 100 | combined filters | 100 | 100 | 4 | 2 |
| 1,000 | unfiltered | 21 | 21 | 0 | 21 |
| 1,000 | `joinPolicy=OPEN` | 41 | 41 | 0 | 21 |
| 1,000 | `category=POLICY` | 61 | 61 | 0 | 21 |
| 1,000 | one-character, many results | 21 | 21 | 0 | 21 |
| 1,000 | two-character, some results | 401 | 401 | 1 | 21 |
| 1,000 | no search result | 1,000 | 1,000 | 7 | 0 |
| 1,000 | combined filters | 1,000 | 1,000 | 6 | 17 |
| 10,000 | unfiltered | 21 | 21 | 0 | 21 |
| 10,000 | `joinPolicy=OPEN` | 41 | 41 | 0 | 21 |
| 10,000 | `category=POLICY` | 61 | 61 | 0 | 21 |
| 10,000 | one-character, many results | 21 | 21 | 0 | 21 |
| 10,000 | two-character, some results | 401 | 401 | 1 | 21 |
| 10,000 | no search result | 10,000 | 10,000 | 24 | 0 |
| 10,000 | combined filters | 1,221 | 1,221 | 3 | 21 |

Execution time varies by machine and run. Document and key examination counts
are the primary comparison values.

## Decision

Keep the existing index and do not add a search-specific compound index in
this change.

- Common first-page requests stop after examining 21 to 61 documents.
- The two-character and combined-result scenarios stop once 21 matches are
  found.
- A contains search with no result examines every eligible document, which is
  expected because a normal B-tree name index cannot optimize an unanchored
  literal regular expression.
- At the measured 10,000-Room scale, the worst scenario completed well within
  the 1-second query bound.

Revisit a `status`, `visibility`, `joinPolicy`, `_id` compound index if
production-like measurements show that the common `joinPolicy=OPEN` path
examines too many documents. Consider an index including `categories` only
after comparing its multikey write/storage cost and both category-present and
category-absent query plans.

## Reproduction

Run against the isolated benchmark database described in the script headers.
Set `LISTED_ROOM_COUNT` to 100, 1,000, and 10,000 in turn, then run the explain
script with `LISTED_ROOM_INCLUDE_WINNING_PLAN=false` for compact output. The
default explain output includes the complete winning plan.
