import type { CSSProperties } from "react";
import {
  isPlatformNavigationItemActive,
  platformNavigationItems,
  resolvePlatformNavigationTarget,
} from "@/lib/platform-navigation";
import {
  PlatformBottomNavigation,
  PlatformBottomNavigationItem,
} from "./platform-bottom-navigation";
import styles from "./platform-shell.module.css";

export type PlatformNavigationProps = Readonly<{
  currentPathname: string;
  prefetch?: boolean;
  requiresLoginForProtectedLinks?: boolean;
}>;

export function PlatformNavigation({
  currentPathname,
  prefetch,
  requiresLoginForProtectedLinks = false,
}: PlatformNavigationProps) {
  return (
    <PlatformBottomNavigation>
      {platformNavigationItems.map((item) => {
        const target = resolvePlatformNavigationTarget(item.href, requiresLoginForProtectedLinks);

        return (
          <PlatformBottomNavigationItem
            aria-current={
              isPlatformNavigationItemActive(currentPathname, item.href) ? "page" : undefined
            }
            href={target.href}
            icon={<PlatformNavigationIcon src={item.iconSrc} />}
            key={item.href}
            label={item.label}
            navigationMode={target.navigationMode}
            platformRoute={item.href}
            {...(prefetch === undefined ? {} : { prefetch })}
          />
        );
      })}
    </PlatformBottomNavigation>
  );
}

export { isPlatformNavigationItemActive, resolvePlatformNavigationTarget };

function PlatformNavigationIcon({ src }: { src: string }) {
  return (
    <span
      className={styles.navigationIcon}
      style={{ "--platform-navigation-icon": `url("${src}")` } as CSSProperties}
    />
  );
}
