(() => {
  "use strict";

  const MAIN_PATH = "/home";
  const LOGIN_PATH = "/login?returnTo=%2Fhome";
  const REFRESH_PATH = "/api/v1/auth/refresh";
  const ANALYTICS_USER_ID_STORAGE_KEY = "civic.analytics-user-id.v1";
  const MINIMUM_SPLASH_MS = 1_500;
  const CHECKING_MESSAGE = "로그인 상태를 확인하고 있습니다.";

  const startup = document.querySelector("[data-pwa-startup-state]");
  const message = document.querySelector("[data-pwa-startup-message]");
  const retryButton = document.querySelector("[data-pwa-startup-retry]");

  if (!startup || !message || !retryButton) return;

  const standaloneDisplayMode =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const standaloneNavigator = window.navigator.standalone === true;

  if (!standaloneDisplayMode && !standaloneNavigator) {
    window.location.replace(MAIN_PATH);
    return;
  }

  let initializationInFlight = false;
  let waitingForRetry = false;

  retryButton.addEventListener("click", () => {
    void initializeSession();
  });
  window.addEventListener("online", () => {
    if (waitingForRetry) void initializeSession();
  });

  void initializeSession();

  async function initializeSession() {
    if (initializationInFlight) return;

    initializationInFlight = true;
    waitingForRetry = false;
    showChecking();

    const [result] = await Promise.all([requestSession(), pause(MINIMUM_SPLASH_MS)]);
    initializationInFlight = false;

    if (result.status === "authenticated") {
      window.location.replace(MAIN_PATH);
      return;
    }
    if (result.status === "unauthenticated") {
      clearAnalyticsUserId();
      window.location.replace(LOGIN_PATH);
      return;
    }

    waitingForRetry = true;
    showFailure(result.reason);
  }

  async function requestSession() {
    if (!window.navigator.onLine) {
      return { status: "retryable-error", reason: "offline" };
    }

    let response;
    try {
      response = await window.fetch(REFRESH_PATH, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    } catch {
      return { status: "retryable-error", reason: "network" };
    }

    await response.body?.cancel().catch(() => undefined);
    if (response.ok) return { status: "authenticated" };
    if (response.status === 401 || response.status === 403) {
      return { status: "unauthenticated" };
    }
    if (response.status === 429) {
      return { status: "retryable-error", reason: "rate-limited" };
    }
    if (response.status >= 500) {
      return { status: "retryable-error", reason: "server" };
    }
    return { status: "retryable-error", reason: "unexpected-response" };
  }

  function showChecking() {
    startup.dataset.pwaStartupState = "checking";
    message.textContent = CHECKING_MESSAGE;
    retryButton.hidden = true;
  }

  function showFailure(reason) {
    startup.dataset.pwaStartupState = "retry";
    message.textContent = failureMessage(reason);
    retryButton.hidden = false;
  }

  function failureMessage(reason) {
    if (reason === "offline" || reason === "network") {
      return "인터넷 연결을 확인해 주세요. 연결되면 자동으로 다시 시도합니다.";
    }
    if (reason === "rate-limited") {
      return "요청이 잠시 지연되고 있습니다. 잠시 후 다시 시도해 주세요.";
    }
    return "로그인 서버에 일시적으로 연결할 수 없습니다. 로그인 정보는 유지됩니다.";
  }

  function clearAnalyticsUserId() {
    try {
      window.sessionStorage.removeItem(ANALYTICS_USER_ID_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in hardened/private browsing contexts.
    }
  }

  function pause(delayMs) {
    return new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }
})();
