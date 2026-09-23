import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { GET } from "../app/pwa/start/route";

const webRoot = path.resolve(import.meta.dirname, "..");
const startupScript = readFileSync(path.join(webRoot, "public/pwa-start/start.js"), "utf8");

describe("standalone PWA start shell", () => {
  it("returns a no-store document with only the dedicated shell assets", async () => {
    const response = GET();
    const html = await response.text();

    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(html).toContain('href="/pwa-start/start.css"');
    expect(html).toContain('src="/pwa-start/start.js"');
    expect(html).toContain('data-pwa-startup-state="checking"');
    expect(html).toContain("로그인 상태를 확인하고 있습니다.");
    expect(html).not.toContain("/_next/static/");
    expect(html).not.toContain("/main-assets/_next/static/");
    expect(html).not.toContain("self.__next_f.push");
    expect(html).not.toContain("globals.css");
  });

  it("redirects normal browser navigation without refreshing the session", async () => {
    const shell = runStartupShell({ standalone: false });

    expect(shell.replace).toHaveBeenCalledWith("/home");
    expect(shell.fetch).not.toHaveBeenCalled();
  });

  it("refreshes an installed PWA session and enters home after the splash", async () => {
    const shell = runStartupShell({ responseStatus: 204 });

    await vi.waitFor(() => expect(shell.replace).toHaveBeenCalledWith("/home"));
    expect(shell.fetch).toHaveBeenCalledWith("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(shell.timeoutDelays).toEqual([1_500]);
  });

  it.each([401, 403])("clears analytics state and opens login for status %s", async (status) => {
    const shell = runStartupShell({ responseStatus: status });

    await vi.waitFor(() => expect(shell.replace).toHaveBeenCalledWith("/login?returnTo=%2Fhome"));
    expect(shell.removeItem).toHaveBeenCalledWith("civic.analytics-user-id.v1");
  });

  it.each([
    [429, "요청이 잠시 지연되고 있습니다"],
    [503, "로그인 서버에 일시적으로 연결할 수 없습니다"],
    [409, "로그인 서버에 일시적으로 연결할 수 없습니다"],
  ])("keeps status %s retryable without clearing login state", async (status, expectedMessage) => {
    const shell = runStartupShell({ responseStatus: status });

    await vi.waitFor(() => expect(shell.startup.dataset.pwaStartupState).toBe("retry"));
    expect(shell.message.textContent).toContain(expectedMessage);
    expect(shell.removeItem).not.toHaveBeenCalled();
    expect(shell.replace).not.toHaveBeenCalled();
  });

  it("keeps network failures retryable", async () => {
    const shell = runStartupShell({ requestError: true });

    await vi.waitFor(() => expect(shell.startup.dataset.pwaStartupState).toBe("retry"));
    expect(shell.message.textContent).toContain("연결되면 자동으로 다시 시도합니다");
    expect(shell.removeItem).not.toHaveBeenCalled();
  });

  it("shows a retry state offline and retries automatically when connectivity returns", async () => {
    const shell = runStartupShell({ online: false });

    await vi.waitFor(() => expect(shell.startup.dataset.pwaStartupState).toBe("retry"));
    expect(shell.fetch).not.toHaveBeenCalled();
    expect(shell.retryButton.hidden).toBe(false);
    expect(shell.message.textContent).toContain("연결되면 자동으로 다시 시도합니다");

    shell.windowObject.navigator.onLine = true;
    shell.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    shell.windowListeners.get("online")?.();

    await vi.waitFor(() => expect(shell.replace).toHaveBeenCalledWith("/home"));
  });
});

type StartupShellOptions = Readonly<{
  online?: boolean;
  requestError?: boolean;
  responseStatus?: number;
  standalone?: boolean;
}>;

function runStartupShell({
  online = true,
  requestError = false,
  responseStatus = 204,
  standalone = true,
}: StartupShellOptions = {}) {
  const replace = vi.fn();
  const removeItem = vi.fn();
  const fetch = vi.fn();
  if (requestError) {
    fetch.mockRejectedValue(new TypeError("offline"));
  } else {
    fetch.mockResolvedValue(new Response(null, { status: responseStatus }));
  }
  const windowListeners = new Map<string, () => void>();
  const buttonListeners = new Map<string, () => void>();
  const timeoutDelays: number[] = [];
  const startup = { dataset: { pwaStartupState: "checking" } };
  const message = { textContent: "로그인 상태를 확인하고 있습니다." };
  const retryButton = {
    hidden: true,
    addEventListener(type: string, listener: () => void) {
      buttonListeners.set(type, listener);
    },
  };
  const windowObject = {
    navigator: { onLine: online, standalone: false },
    location: { replace },
    sessionStorage: { removeItem },
    fetch,
    matchMedia: vi.fn().mockReturnValue({ matches: standalone }),
    addEventListener(type: string, listener: () => void) {
      windowListeners.set(type, listener);
    },
    setTimeout(callback: () => void, delay: number) {
      timeoutDelays.push(delay);
      callback();
      return 0;
    },
  };
  const documentObject = {
    querySelector(selector: string) {
      if (selector === "[data-pwa-startup-state]") return startup;
      if (selector === "[data-pwa-startup-message]") return message;
      if (selector === "[data-pwa-startup-retry]") return retryButton;
      return null;
    },
  };

  runInNewContext(startupScript, { document: documentObject, window: windowObject });

  return {
    buttonListeners,
    fetch,
    message,
    removeItem,
    replace,
    retryButton,
    startup,
    timeoutDelays,
    windowListeners,
    windowObject,
  };
}
