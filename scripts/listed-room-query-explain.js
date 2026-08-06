// Run after listed-room-query-load.js against the same isolated database:
// docker compose -f compose.local.yaml exec -T mongodb \
//   mongosh --quiet \
//   mongodb://localhost:27017/chat_query_benchmark --file /dev/stdin \
//   < scripts/listed-room-query-explain.js

const pageSize = Number(process.env.LISTED_ROOM_PAGE_SIZE || "20");
const maxTimeMS = Number(
    process.env.LISTED_ROOM_QUERY_MAX_TIME_MS || "1000");
const includeWinningPlan =
    process.env.LISTED_ROOM_INCLUDE_WINNING_PLAN !== "false";

if (!Number.isSafeInteger(pageSize)
    || pageSize < 1
    || pageSize > 100
    || !Number.isSafeInteger(maxTimeMS)
    || maxTimeMS < 1
    || maxTimeMS > 30000) {
    throw new Error("Listed Room explain parameters are invalid");
}

function literalRegex(value) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(escaped, "i");
}

const fixed = {status: "ACTIVE", visibility: "LISTED"};
const scenarios = [
    {name: "unfiltered", filter: {...fixed}},
    {
        name: "joinPolicyOpen",
        filter: {...fixed, joinPolicy: "OPEN"},
    },
    {
        name: "categoryPolicy",
        filter: {...fixed, categories: "POLICY"},
    },
    {
        name: "oneCharacterManyResults",
        filter: {...fixed, name: {$regex: literalRegex("방")}},
    },
    {
        name: "twoCharactersSomeResults",
        filter: {...fixed, name: {$regex: literalRegex("교통")}},
    },
    {
        name: "noSearchResult",
        filter: {...fixed, name: {$regex: literalRegex("검색결과없음")}},
    },
    {
        name: "combined",
        filter: {
            ...fixed,
            joinPolicy: "OPEN",
            categories: "LOCAL_ISSUE",
            name: {$regex: literalRegex("교통")},
        },
    },
];

function findIndexName(stage) {
    if (!stage || typeof stage !== "object") return null;
    if (stage.indexName) return stage.indexName;
    for (const value of Object.values(stage)) {
        const found = findIndexName(value);
        if (found) return found;
    }
    return null;
}

function containsStage(stage, expected) {
    if (!stage || typeof stage !== "object") return false;
    if (stage.stage === expected) return true;
    return Object.values(stage).some(
        value => containsStage(value, expected));
}

const results = scenarios.map(scenario => {
    const explanation = db.runCommand({
        explain: {
            find: "chat_rooms",
            filter: scenario.filter,
            sort: {_id: 1},
            limit: pageSize + 1,
            maxTimeMS,
        },
        verbosity: "executionStats",
    });
    if (!explanation.ok) {
        throw new Error(JSON.stringify(explanation));
    }
    const result = {
        scenario: scenario.name,
        filter: scenario.filter,
        observedLimit: pageSize + 1,
        indexName: findIndexName(
            explanation.queryPlanner.winningPlan),
        blockingSort: containsStage(
            explanation.queryPlanner.winningPlan,
            "SORT"),
        totalKeysExamined:
            explanation.executionStats.totalKeysExamined,
        totalDocsExamined:
            explanation.executionStats.totalDocsExamined,
        executionTimeMillis:
            explanation.executionStats.executionTimeMillis,
        nReturned: explanation.executionStats.nReturned,
    };
    if (includeWinningPlan) {
        result.winningPlan = explanation.queryPlanner.winningPlan;
    }
    return result;
});

print(JSON.stringify({
    environment: "isolated local MongoDB; executionStats; not HTTP latency",
    database: db.getName(),
    fixtureCount: db.chat_rooms.countDocuments({
        _id: {$regex: "^performance-listed-room-"},
    }),
    pageSize,
    maxTimeMS,
    results,
}, null, 2));
