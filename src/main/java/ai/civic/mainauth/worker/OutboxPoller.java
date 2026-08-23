package ai.civic.mainauth.worker;

public interface OutboxPoller {
    String channel();

    boolean pollOnce();
}
