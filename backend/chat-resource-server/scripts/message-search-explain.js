// Run after message-search-load.js against the same isolated database:
// docker compose -f compose.local.yaml exec -T mongodb \
//   mongosh --quiet \
//   mongodb://localhost:27017/chat_message_search_benchmark --file /dev/stdin \
//   < scripts/message-search-explain.js

const roomId = process.env.MESSAGE_SEARCH_ROOM_ID
    || "performance-message-search-room";
const upperBound = Number(
    process.env.MESSAGE_SEARCH_UPPER_BOUND || "10000");
const visibilityBoundary = Number(
    process.env.MESSAGE_SEARCH_VISIBILITY_BOUNDARY || "0");
const candidateChunkSize = Number(
    process.env.MESSAGE_SEARCH_CANDIDATE_CHUNK_SIZE || "500");
const maxTimeMS = Number(
    process.env.MESSAGE_SEARCH_MONGO_MAX_TIME_MS || "500");
const maxScannedPerRequest = Number(
    process.env.MESSAGE_SEARCH_MAX_SCANNED_PER_REQUEST || "2000");
const includeWinningPlan =
    process.env.MESSAGE_SEARCH_INCLUDE_WINNING_PLAN !== "false";

if (!Number.isSafeInteger(upperBound)
    || upperBound < 0
    || !Number.isSafeInteger(visibilityBoundary)
    || visibilityBoundary < 0
    || visibilityBoundary > upperBound
    || !Number.isSafeInteger(candidateChunkSize)
    || candidateChunkSize < 1
    || candidateChunkSize > 2000
    || !Number.isSafeInteger(maxScannedPerRequest)
    || maxScannedPerRequest < 1
    || maxScannedPerRequest > 10000
    || !Number.isSafeInteger(maxTimeMS)
    || maxTimeMS < 1
    || maxTimeMS > 30000) {
    throw new Error("Message search explain parameters are invalid");
}

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

const scenarios = [
    {name: "latestChunk", beforeSequence: null},
    {
        name: "continuationChunk",
        beforeSequence: Math.max(
            visibilityBoundary + 1,
            upperBound - candidateChunkSize),
    },
    {
        name: "nearVisibilityBoundary",
        beforeSequence: Math.min(
            upperBound,
            visibilityBoundary + candidateChunkSize + 1),
    },
];

const results = scenarios.map(scenario => {
    const range = {
        $gt: Long.fromNumber(visibilityBoundary),
        $lte: Long.fromNumber(upperBound),
    };
    if (scenario.beforeSequence !== null) {
        range.$lt = Long.fromNumber(scenario.beforeSequence);
    }
    const explanation = db.runCommand({
        explain: {
            find: "chat_messages",
            filter: {
                roomId,
                state: "ACTIVE",
                countable: true,
                roomSequence: range,
            },
            sort: {roomSequence: -1},
            limit: candidateChunkSize + 1,
            maxTimeMS,
        },
        verbosity: "executionStats",
    });
    if (!explanation.ok) {
        throw new Error(JSON.stringify(explanation));
    }
    const plan = explanation.queryPlanner.winningPlan;
    const result = {
        scenario: scenario.name,
        beforeSequence: scenario.beforeSequence,
        observedLimit: candidateChunkSize + 1,
        indexName: findIndexName(plan),
        collscan: containsStage(plan, "COLLSCAN"),
        blockingSort: containsStage(plan, "SORT"),
        totalKeysExamined:
            explanation.executionStats.totalKeysExamined,
        totalDocsExamined:
            explanation.executionStats.totalDocsExamined,
        executionTimeMillis:
            explanation.executionStats.executionTimeMillis,
        nReturned: explanation.executionStats.nReturned,
    };
    if (includeWinningPlan) result.winningPlan = plan;
    return result;
});

function applicationScan(query) {
    const startedAt = Date.now();
    const candidates = db.chat_messages.find({
        roomId,
        state: "ACTIVE",
        countable: true,
        roomSequence: {
            $gt: Long.fromNumber(visibilityBoundary),
            $lte: Long.fromNumber(upperBound),
        },
    }).sort({roomSequence: -1})
        .limit(maxScannedPerRequest)
        .toArray();
    const normalizedQuery = query.toLowerCase();
    const matches = candidates.filter(document =>
        document.content.toLowerCase().includes(normalizedQuery));
    return {
        queryKind: query === "search-needle" ? "fixtureMatch" : "noMatch",
        scanned: candidates.length,
        matches: matches.length,
        durationMillis: Date.now() - startedAt,
    };
}

print(JSON.stringify({
    environment: "isolated local MongoDB; executionStats; not HTTP latency",
    database: db.getName(),
    roomId,
    upperBound,
    visibilityBoundary,
    candidateChunkSize,
    maxScannedPerRequest,
    maxTimeMS,
    results,
    applicationScans: [
        applicationScan("search-needle"),
        applicationScan("absent-needle"),
    ],
}, null, 2));
