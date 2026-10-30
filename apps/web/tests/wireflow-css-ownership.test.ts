import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = join(__dirname, "..", "app");

const canonicalSelectors = [
  ".civic-shell",
  ".civic-functional-screen",
  ".civic-public-screen",
  ".civic-form-card",
  ".civic-action-panel",
  ".civic-user-detail",
  ".civic-primary-action",
  ".civic-secondary-action",
  ".civic-danger-action",
  ".civic-icon-action",
  ".civic-admin-search button",
  ".civic-auth-support article > span",
] as const;

function selectorProperties(css: string) {
  const properties = new Map<string, Set<string>>();
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, "");

  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    const selectorList = match[1]?.trim();
    const declarationBlock = match[2];
    if (!selectorList || selectorList.startsWith("@") || !declarationBlock) continue;

    const declarations = declarationBlock
      .split(";")
      .map((declaration) => declaration.slice(0, declaration.indexOf(":")).trim())
      .filter(Boolean);

    for (const selector of selectorList.split(",").map((value) => value.trim())) {
      if (!canonicalSelectors.includes(selector as (typeof canonicalSelectors)[number])) continue;
      const ownedProperties = properties.get(selector) ?? new Set<string>();
      declarations.forEach((property) => ownedProperties.add(property));
      properties.set(selector, ownedProperties);
    }
  }

  return properties;
}

function selectorsIn(css: string) {
  const selectors: string[] = [];
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, "");

  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    const selectorList = match[1]?.trim();
    if (!selectorList || selectorList.startsWith("@")) continue;
    selectors.push(...selectorList.split(",").map((selector) => selector.trim()));
  }

  return selectors;
}

describe("wireflow CSS ownership", () => {
  const globals = readFileSync(join(appRoot, "globals.css"), "utf8");
  const home = readFileSync(join(appRoot, "home", "home.css"), "utf8");
  const wireflowBase = readFileSync(join(appRoot, "wireflow-base.css"), "utf8");
  const wireflowCore = readFileSync(join(appRoot, "wireflow-core.css"), "utf8");
  const adminShell = readFileSync(join(appRoot, "admin-shell.css"), "utf8");
  const adminBase = readFileSync(join(appRoot, "admin-base.css"), "utf8");
  const adminConsole = readFileSync(join(appRoot, "admin-console.css"), "utf8");

  it("globals와 wireflow base가 canonical selector의 같은 property를 다시 정의하지 않는다", () => {
    const globalProperties = selectorProperties(globals);
    const wireflowProperties = selectorProperties(`${wireflowCore}\n${wireflowBase}`);

    const overlaps = canonicalSelectors.flatMap((selector) =>
      [...(globalProperties.get(selector) ?? [])]
        .filter((property) => wireflowProperties.get(selector)?.has(property))
        .map((property) => `${selector}: ${property}`),
    );

    expect(overlaps).toEqual([]);
  });

  it("wireflow core가 /home과 전체 wireflow route의 공통 foundation을 소유한다", () => {
    expect(home).toContain('@import "../wireflow-core.css";');
    expect(home).not.toContain("wireflow-base.css");
    expect(wireflowBase).toContain('@import "./wireflow-core.css";');
    expect(wireflowCore).toContain("[data-wireflow-screen].civic-functional-screen");
    expect(wireflowCore).toContain(".wf-button:focus-visible");
  });

  it("독립 common route만 global ScreenFrame fallback을 쓴다", () => {
    expect(globals).toContain('[data-wireflow-screen="COMMON-001"]');
    expect(globals).toContain('[data-wireflow-screen="COMMON-004"]');
    expect(globals).not.toMatch(/^\[data-wireflow-screen\]\.civic-functional-screen\s*\{/gmu);
  });

  it("admin console 스타일은 route 전용 stylesheet가 소유한다", () => {
    const globalSelectors = selectorsIn(globals);

    expect(globalSelectors).not.toContain(".civic-admin-sidebar");
    expect(globalSelectors).not.toContain(".civic-admin-nav-link");
    expect(globals).not.toContain('[data-wireflow-shell="admin"]');
    expect(globalSelectors).not.toContain(".civic-admin-workbench");
    expect(globalSelectors).not.toContain(".civic-admin-search");
    expect(globals).not.toContain('[data-wireflow-shell="admin"] .civic-domain-console');
    expect(globals).not.toContain('[data-wireflow-layout="task-detail"].civic-domain-console');

    expect(adminShell).toContain(".civic-admin-sidebar");
    expect(adminShell).toContain(".civic-admin-nav-link");
    expect(adminShell).toContain('[data-wireflow-shell="admin"]');
    expect(adminBase).toContain(".civic-admin-workbench");
    expect(adminBase).toContain(".civic-admin-search");
    expect(adminBase).toContain('[data-wireflow-shell="admin"] .civic-domain-console');
    expect(adminBase).toContain('[data-wireflow-layout="task-detail"].civic-domain-console');
    expect(adminConsole).toContain(".console-workspace");
  });

  it("A-RAG 폴더 펼치기 버튼은 WCAG 2.2 최소 대상 크기 24×24를 지킨다", () => {
    const wireflow = readFileSync(join(appRoot, "wireflow.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//gu,
      "",
    );
    const expanderRules = [
      ...wireflow.matchAll(
        /\[data-wireflow-screen\^="A-RAG"\] \.civic-folder-tree li > \.civic-folder-expander \{([^{}]*)\}/gu,
      ),
    ].map((match) => match[1] ?? "");
    expect(expanderRules.length).toBeGreaterThan(0);
    const lastValue = (property: string) =>
      expanderRules
        .flatMap((rule) => [
          ...rule.matchAll(new RegExp(`(?:^|;|\\s)${property}:\\s*(\\d+)px`, "gu")),
        ])
        .map((match) => Number(match[1]))
        .at(-1);
    expect(lastValue("width")).toBeGreaterThanOrEqual(24);
    expect(lastValue("min-height")).toBeGreaterThanOrEqual(24);
  });
});
