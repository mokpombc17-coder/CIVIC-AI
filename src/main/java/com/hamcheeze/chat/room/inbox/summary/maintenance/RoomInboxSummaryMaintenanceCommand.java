package com.hamcheeze.chat.room.inbox.summary.maintenance;

import com.hamcheeze.chat.room.inbox.summary.maintenance.mongo.MongoRoomInboxSummaryCandidateReader;
import com.hamcheeze.chat.room.inbox.summary.maintenance.mongo.MongoRoomInboxSummaryMaintenanceRepository;
import com.hamcheeze.chat.room.inbox.summary.maintenance.mongo.MongoRoomInboxSummaryMaintenancePreflight;
import com.hamcheeze.chat.room.inbox.summary.maintenance.mongo.MongoRoomInboxSummaryRepairWriter;
import com.hamcheeze.chat.room.inbox.summary.mongo.MongoRoomInboxSummarySchemaInitializer;
import com.mongodb.ConnectionString;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;

import java.io.PrintStream;
import java.util.Map;

public final class RoomInboxSummaryMaintenanceCommand {

    private static final int EXIT_OPERATION_FAILED = 1;
    private static final int EXIT_INVALID_ARGUMENT = 2;

    private RoomInboxSummaryMaintenanceCommand() {
    }

    public static void main(String[] args) {
        int exitCode = run(
                args,
                System.getenv(),
                System.out,
                System.err);
        if (exitCode != 0) {
            System.exit(exitCode);
        }
    }

    public static int run(
            String[] args,
            Map<String, String> environment,
            PrintStream output,
            PrintStream error
    ) {
        RoomInboxSummaryMaintenanceOptions options;
        try {
            options = RoomInboxSummaryMaintenanceOptions.parse(args);
        } catch (IllegalArgumentException exception) {
            error.println("maintenance-argument-error="
                    + safe(exception.getMessage()));
            return EXIT_INVALID_ARGUMENT;
        }

        String uri = environment.get("CHAT_MONGODB_URI");
        if (uri == null || uri.isBlank()) {
            error.println(
                    "maintenance-argument-error=mongodb-uri-missing");
            return EXIT_INVALID_ARGUMENT;
        }
        ConnectionString connectionString;
        try {
            connectionString = new ConnectionString(uri);
        } catch (IllegalArgumentException exception) {
            error.println(
                    "maintenance-argument-error=invalid-mongodb-uri");
            return EXIT_INVALID_ARGUMENT;
        }
        if (connectionString.getDatabase() == null
                || connectionString.getDatabase().isBlank()) {
            error.println("maintenance-argument-error="
                    + "mongodb-uri-database-missing");
            return EXIT_INVALID_ARGUMENT;
        }

        try (MongoClient mongoClient = MongoClients.create(
                connectionString)) {
            MongoTemplate mongoOperations = new MongoTemplate(
                    new SimpleMongoClientDatabaseFactory(
                            mongoClient,
                            connectionString.getDatabase()));
            try {
                new MongoRoomInboxSummaryMaintenancePreflight(
                        mongoOperations).verify(options.mode());
            } catch (MongoRoomInboxSummaryMaintenancePreflight
                    .PreflightException exception) {
                error.println("maintenance-preflight-error="
                        + exception.failureKind());
                return EXIT_OPERATION_FAILED;
            }
            if (options.mode()
                    == RoomInboxSummaryMaintenanceMode.APPLY) {
                new MongoRoomInboxSummarySchemaInitializer(
                        mongoOperations).initialize();
            }
            MongoRoomInboxSummaryCandidateReader candidateReader =
                    new MongoRoomInboxSummaryCandidateReader(
                            mongoOperations);
            MongoRoomInboxSummaryMaintenanceRepository repository =
                    new MongoRoomInboxSummaryMaintenanceRepository(
                            mongoOperations);
            MongoRoomInboxSummaryRepairWriter repairWriter =
                    new MongoRoomInboxSummaryRepairWriter(repository);
            RoomInboxSummaryMaintenanceReport report =
                    switch (options.mode()) {
                        case DRY_RUN, APPLY ->
                                new RoomInboxSummaryBackfillService(
                                        candidateReader,
                                        repairWriter,
                                        diagnostic -> error.println(
                                                render(diagnostic)))
                                        .run(options);
                        case VALIDATE -> new RoomInboxSummaryValidator(
                                candidateReader,
                                repository,
                                diagnostic -> error.println(
                                        render(diagnostic)))
                                .validate(options);
                    };
            output.println(report.toJson());
            return report.completedSuccessfully()
                    ? 0
                    : EXIT_OPERATION_FAILED;
        } catch (RuntimeException exception) {
            error.println("maintenance-operation-error="
                    + exception.getClass().getSimpleName());
            return EXIT_OPERATION_FAILED;
        }
    }

    private static String render(
            RoomInboxSummaryMaintenanceDiagnostic diagnostic
    ) {
        return "roomId=" + safe(diagnostic.roomId())
                + " messageId=" + safe(diagnostic.messageId())
                + " storedSequence=" + diagnostic.storedSequence()
                + " storedVersion=" + diagnostic.storedVersion()
                + " expectedSequence=" + diagnostic.expectedSequence()
                + " expectedVersion=" + diagnostic.expectedVersion()
                + " state=" + safe(diagnostic.state())
                + " action=" + diagnostic.action()
                + " mismatchFields=" + diagnostic.mismatchFields()
                + " detail=" + safe(diagnostic.detail());
    }

    private static String safe(String value) {
        if (value == null) {
            return "null";
        }
        return value.replace('\n', '_')
                .replace('\r', '_')
                .replace('\t', '_');
    }
}
