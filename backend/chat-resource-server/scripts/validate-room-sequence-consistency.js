// Exits non-zero if persisted visibility/read/message cursors exceed the
// current chat_room_sequences.lastSequence lower bound.

function violations(collection, sequenceField) {
    return db.getCollection(collection).aggregate([
        {$lookup: {
            from: "chat_room_sequences",
            localField: "roomId",
            foreignField: "_id",
            as: "sequence",
        }},
        {$set: {
            currentLastSequence: {$ifNull: [
                {$first: "$sequence.lastSequence"},
                NumberLong("0"),
            ]},
        }},
        {$match: {$expr: {$gt: [
            `$${sequenceField}`,
            "$currentLastSequence",
        ]}}},
        {$project: {
            _id: 0,
            sourceId: "$_id",
            roomId: 1,
            sourceSequence: `$${sequenceField}`,
            currentLastSequence: 1,
        }},
        {$sort: {roomId: 1, sourceId: 1}},
    ]).toArray();
}

const checks = [
    {
        kind: "MEMBERSHIP_BOUNDARY",
        rows: violations(
            "chat_memberships", "messageVisibleAfterSequence"),
    },
    {
        kind: "READ_STATE",
        rows: violations(
            "chat_room_read_states", "lastReadSequence"),
    },
    {
        kind: "MESSAGE_SEQUENCE",
        rows: violations("chat_messages", "roomSequence"),
    },
];

let violationCount = 0;
for (const check of checks) {
    violationCount += check.rows.length;
    for (const row of check.rows) {
        print(EJSON.stringify({kind: check.kind, ...row}, {relaxed: true}));
    }
}
print(EJSON.stringify({
    valid: violationCount === 0,
    violationCount,
    membershipBoundaryViolations: checks[0].rows.length,
    readStateViolations: checks[1].rows.length,
    messageSequenceViolations: checks[2].rows.length,
}, {relaxed: true}));

if (violationCount > 0) quit(2);
