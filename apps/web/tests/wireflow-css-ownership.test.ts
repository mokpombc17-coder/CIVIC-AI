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
  const wireflowBase = readFileSync(join(appRoot, "wireflow-base.css"), "utf8");
  const adminBase = readFileSync(join(appRoot, "admin-base.css"), "utf8");
  const adminConsole = readFileSync(join(appRoot, "admin-console.css"), "utf8");

  it("globals와 wireflow base가 canonical selector의 같은 property를 다시 정의하지 않는다", () => {
    const globalProperties = selectorProperties(globals);
    const baseProperties = selectorProperties(wireflowBase);

    const overlaps = canonicalSelectors.flatMap((selector) =>
      [...(globalProperties.get(selector) ?? [])]
        .filter((property) => baseProperties.get(selector)?.has(property))
        .map((property) => `${selector}: ${property}`),
    );

    expect(overlaps).toEqual([]);
  });

  it("wireflow base가 ScreenFrame reset을 소유하고 독립 common route만 global fallback을 쓴다", () => {
    expect(wireflowBase).toContain("[data-wireflow-screen].civic-functional-screen");
    expect(globals).toContain('[data-wireflow-screen="COMMON-001"]');
    expect(globals).toContain('[data-wireflow-screen="COMMON-004"]');
    expect(globals).not.toMatch(/^\[data-wireflow-screen\]\.civic-functional-screen\s*\{/gmu);
  });

  it("admin console 스타일은 route 전용 stylesheet가 소유한다", () => {
    const globalSelectors = selectorsIn(globals);

    expect(globalSelectors).toContain(".civic-admin-sidebar");
    expect(globalSelectors).toContain(".civic-admin-nav-link");
    expect(globalSelectors).not.toContain(".civic-admin-workbench");
    expect(globalSelectors).not.toContain(".civic-admin-search");
    expect(globals).not.toContain('[data-wireflow-shell="admin"] .civic-domain-console');
    expect(globals).not.toContain('[data-wireflow-layout="task-detail"].civic-domain-console');

    expect(adminBase).toContain(".civic-admin-workbench");
    expect(adminBase).toContain(".civic-admin-search");
    expect(adminBase).toContain('[data-wireflow-shell="admin"] .civic-domain-console');
    expect(adminBase).toContain('[data-wireflow-layout="task-detail"].civic-domain-console');
    expect(adminConsole).toContain(".console-workspace");
  });
});
