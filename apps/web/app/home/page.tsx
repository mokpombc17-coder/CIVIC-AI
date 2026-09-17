import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DeferredHomeQueryRuntime } from "@/components/auth/deferred-home-query-runtime";
import {
  ParticipantHomeActions,
  ParticipantHomeScreen,
} from "@/components/screens/participant-home-screen";
import { HomeHeroAnimationController } from "@/components/screens/home-hero-animation-controller";
import { screenFrameHeading } from "@/components/screens/screen-frame";
import { CurrentUserGreeting } from "@/components/shell/current-user-greeting";
import { HomeBrandTitle } from "@/components/shell/home-brand-title";
import { ParticipantShell } from "@/components/shell/participant-shell";
import { PlatformNavigation } from "@/components/platform-shell";
import { hasAccessCredential } from "@/lib/auth/require-access";
import { homeMetadata, websiteJsonLd } from "@/lib/home-search";
import { getScreenByRoute } from "@/lib/screens/registry";

export const metadata: Metadata = homeMetadata;

export default function HomePage() {
  const accessCredential = hasAccessCredential();
  const screen = getScreenByRoute("/home");
  if (!screen) throw new TypeError("U-HOME-001 screen is missing");
  const heading = screenFrameHeading(screen);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteJsonLd).replace(/</gu, "\\u003c"),
        }}
        type="application/ld+json"
      />
      <ParticipantShell
        activeRoute="/home"
        bottomNavigation={
          <Suspense fallback={<HomeBottomNavigation requiresLoginForProtectedLinks />}>
            <ResolvedHomeBottomNavigation accessCredential={accessCredential} />
          </Suspense>
        }
        headerActions={
          <Suspense fallback={<HomeLoginLink />}>
            <ResolvedHomeHeaderActions accessCredential={accessCredential} />
          </Suspense>
        }
        headerTitle={<HomeBrandTitle />}
        title={heading.title}
      >
        <Suspense fallback={null}>
          <ResolvedHomeQueryRuntime accessCredential={accessCredential} />
        </Suspense>
        <HomeHeroAnimationController />
        <ParticipantHomeScreen
          homeActions={
            <Suspense fallback={<ParticipantHomeActions requiresLoginForProtectedLinks />}>
              <ResolvedParticipantHomeActions accessCredential={accessCredential} />
            </Suspense>
          }
          screen={screen}
        />
      </ParticipantShell>
    </>
  );
}

function HomeLoginLink() {
  return (
    <Link
      className="civic-header-login"
      href={{ pathname: "/login", query: { returnTo: "/home" } }}
      prefetch={false}
    >
      로그인
    </Link>
  );
}

function HomeBottomNavigation({
  requiresLoginForProtectedLinks,
}: Readonly<{ requiresLoginForProtectedLinks: boolean }>) {
  return (
    <PlatformNavigation
      currentPathname="/home"
      prefetch={false}
      requiresLoginForProtectedLinks={requiresLoginForProtectedLinks}
    />
  );
}

async function ResolvedHomeHeaderActions({
  accessCredential,
}: Readonly<{ accessCredential: Promise<boolean> }>) {
  return (await accessCredential) ? <CurrentUserGreeting /> : <HomeLoginLink />;
}

async function ResolvedHomeBottomNavigation({
  accessCredential,
}: Readonly<{ accessCredential: Promise<boolean> }>) {
  return <HomeBottomNavigation requiresLoginForProtectedLinks={!(await accessCredential)} />;
}

async function ResolvedParticipantHomeActions({
  accessCredential,
}: Readonly<{ accessCredential: Promise<boolean> }>) {
  return <ParticipantHomeActions requiresLoginForProtectedLinks={!(await accessCredential)} />;
}

async function ResolvedHomeQueryRuntime({
  accessCredential,
}: Readonly<{ accessCredential: Promise<boolean> }>) {
  return <DeferredHomeQueryRuntime authenticated={await accessCredential} />;
}
