(() => {
  "use strict";

  const bootstrapKey = "__civicParticipantSwipeBootstrap";
  const reactReadyEvent = "civic:participant-swipe-react-ready";
  if (window[bootstrapKey]) return;

  const participantSurfaces = Array.from(
    document.querySelectorAll('[data-participant-surface="true"]'),
  ).filter((candidate) => candidate instanceof HTMLElement);
  const surface = participantSurfaces[participantSurfaces.length - 1];
  if (!(surface instanceof HTMLElement)) return;
  if (surface.dataset.participantSwipeReady === "true") return;

  const participantShell = surface.closest('[data-platform-shell="true"]');
  const navigationLinks = Array.from(
    participantShell?.querySelectorAll("[data-platform-navigation-route]") ?? [],
  ).filter((link) => link instanceof HTMLAnchorElement);
  const activeLink = navigationLinks.find((link) => link.getAttribute("aria-current") === "page");
  const currentRoute = activeLink?.dataset.platformNavigationRoute;
  if (!currentRoute || navigationLinks.length === 0) return;

  const cancelDurationMs = 180;
  const dragFollowDurationMs = 70;
  const exitDurationMs = 150;
  const recentVelocityWindowMs = 100;
  const directionRatio = 1.5;
  const directionSlop = 12;
  const distanceThreshold = 80;
  const fastDistanceThreshold = 40;
  const velocityThreshold = 0.5;
  const resistance = 0.35;
  const softCapStart = 28;
  const maximumVisualDistance = 40;
  const blockingOverlaySelector =
    'dialog[open], [aria-modal="true"], [data-swipe-navigation-blocking]';
  const originalInlineStyles = {
    touchAction: surface.style.touchAction,
    transform: surface.style.transform,
    transition: surface.style.transition,
    userSelect: surface.style.userSelect,
    willChange: surface.style.willChange,
  };
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let gesture = null;
  let isNavigating = false;
  let interactionSettling = false;
  let takeoverRequested = false;
  let animationFrame = 0;
  let navigationFallback = 0;
  let temporaryStyleReset = 0;
  let suppressClick = false;
  let suppressClickReset = 0;
  let removeTransitionListener;
  let cleaned = false;

  surface.style.touchAction = "pan-y pinch-zoom";

  const writeVisualOffset = (offset) => {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = window.requestAnimationFrame(() => {
      surface.style.transform = `translate3d(${offset}px, 0, 0)`;
    });
  };

  const clearTemporaryStyles = () => {
    surface.style.userSelect = originalInlineStyles.userSelect;
    surface.style.willChange = originalInlineStyles.willChange;
  };

  const finishInteraction = () => {
    interactionSettling = false;
    if (takeoverRequested) cleanup();
  };

  const cancelGesture = () => {
    interactionSettling = true;
    surface.style.transition = reducedMotion ? "none" : `transform ${cancelDurationMs}ms ease-out`;
    writeVisualOffset(0);
    window.clearTimeout(temporaryStyleReset);
    temporaryStyleReset = window.setTimeout(
      () => {
        clearTemporaryStyles();
        finishInteraction();
      },
      reducedMotion ? 0 : cancelDurationMs,
    );
  };

  const findNavigationLink = (targetRoute) =>
    navigationLinks.find((link) => link.dataset.platformNavigationRoute === targetRoute);

  const participantSwipeDestination = (deltaX) => {
    const currentIndex = navigationLinks.findIndex(
      (link) => link.dataset.platformNavigationRoute === currentRoute,
    );
    if (currentIndex < 0 || deltaX === 0) return null;
    const targetIndex = currentIndex + (deltaX < 0 ? 1 : -1);
    return navigationLinks[targetIndex]?.dataset.platformNavigationRoute ?? null;
  };

  const participantSwipeVisualOffset = (deltaX) => {
    const direction = Math.sign(deltaX);
    const resistedDistance = Math.abs(deltaX) * resistance;
    if (resistedDistance <= softCapStart) return deltaX * resistance;

    const softRange = maximumVisualDistance - softCapStart;
    const overflow = resistedDistance - softCapStart;
    const softenedDistance = softCapStart + softRange * (1 - Math.exp(-overflow / softRange));
    return direction * softenedDistance;
  };

  const isParticipantSwipeNavigation = (deltaX, velocityX) => {
    const distance = Math.abs(deltaX);
    return (
      distance >= distanceThreshold ||
      (distance >= fastDistanceThreshold && Math.abs(velocityX) >= velocityThreshold)
    );
  };

  const finishNavigation = (targetLink) => {
    if (!interactionSettling) return;
    window.clearTimeout(navigationFallback);
    removeTransitionListener?.();
    targetLink.click();
    finishInteraction();
  };

  const navigateTo = (targetRoute, direction) => {
    const targetLink = findNavigationLink(targetRoute);
    if (!targetLink) {
      cancelGesture();
      return;
    }

    isNavigating = true;
    interactionSettling = true;
    if (reducedMotion) {
      finishNavigation(targetLink);
      return;
    }

    const handleTransitionEnd = (event) => {
      if (event.target === surface && event.propertyName === "transform") {
        finishNavigation(targetLink);
      }
    };
    surface.addEventListener("transitionend", handleTransitionEnd);
    removeTransitionListener = () =>
      surface.removeEventListener("transitionend", handleTransitionEnd);
    navigationFallback = window.setTimeout(() => finishNavigation(targetLink), exitDurationMs + 50);

    surface.style.transition = `transform ${exitDurationMs}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    const exitDistance = (surface.getBoundingClientRect().width + 24) * direction;
    writeVisualOffset(exitDistance);
  };

  const isSupportedPointer = (event) => {
    if (event.pointerType === "touch" || event.pointerType === "pen") return true;
    if (event.pointerType !== "mouse") return false;
    return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  };

  const handlePointerDown = (event) => {
    if (takeoverRequested && !gesture) {
      event.stopImmediatePropagation();
      return;
    }

    if (
      isNavigating ||
      gesture ||
      document.querySelector(blockingOverlaySelector) ||
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0) ||
      !isSupportedPointer(event)
    ) {
      return;
    }

    surface.style.transition = "none";
    gesture = {
      intent: "pending",
      lastTime: event.timeStamp,
      lastX: event.clientX,
      pointerId: event.pointerId,
      previousTime: event.timeStamp,
      previousX: event.clientX,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const handlePointerMove = (event) => {
    if (!gesture || gesture.pointerId !== event.pointerId || isNavigating) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const absoluteX = Math.abs(deltaX);
    const absoluteY = Math.abs(deltaY);

    if (gesture.intent === "pending") {
      if (Math.max(absoluteX, absoluteY) < directionSlop) return;
      if (absoluteX > absoluteY * directionRatio) {
        gesture.intent = "horizontal";
        surface.style.userSelect = "none";
        surface.style.willChange = "transform";
        surface.style.transition = reducedMotion
          ? "none"
          : `transform ${dragFollowDurationMs}ms linear`;
        try {
          surface.setPointerCapture?.(event.pointerId);
        } catch {}
        document.getSelection()?.removeAllRanges();
      } else if (absoluteY > absoluteX) {
        gesture.intent = "vertical";
        clearTemporaryStyles();
      } else {
        return;
      }
    }

    if (gesture.intent !== "horizontal") return;

    event.preventDefault();
    suppressClick = true;
    gesture.previousX = gesture.lastX;
    gesture.previousTime = gesture.lastTime;
    gesture.lastX = event.clientX;
    gesture.lastTime = event.timeStamp;

    const destination = participantSwipeDestination(deltaX);
    writeVisualOffset(destination ? participantSwipeVisualOffset(deltaX) : 0);
  };

  const handlePointerEnd = (event) => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const completedGesture = gesture;
    gesture = null;
    if (surface.hasPointerCapture?.(event.pointerId)) {
      surface.releasePointerCapture?.(event.pointerId);
    }

    if (completedGesture.intent !== "horizontal") {
      clearTemporaryStyles();
      if (takeoverRequested) cleanup();
      return;
    }

    event.preventDefault();
    window.clearTimeout(suppressClickReset);
    suppressClickReset = window.setTimeout(() => {
      suppressClick = false;
    }, 0);

    if (event.type === "pointercancel") {
      cancelGesture();
      return;
    }

    const deltaX = event.clientX - completedGesture.startX;
    const destination = participantSwipeDestination(deltaX);
    const sampleDuration = completedGesture.lastTime - completedGesture.previousTime;
    const sampleAge = event.timeStamp - completedGesture.lastTime;
    const velocityX =
      sampleDuration > 0 && sampleAge <= recentVelocityWindowMs
        ? (completedGesture.lastX - completedGesture.previousX) / sampleDuration
        : 0;

    if (destination && isParticipantSwipeNavigation(deltaX, velocityX)) {
      navigateTo(destination, deltaX < 0 ? -1 : 1);
    } else {
      cancelGesture();
    }
  };

  const handleClick = (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDragStart = (event) => {
    if (gesture) event.preventDefault();
  };

  const handleReactReady = () => {
    takeoverRequested = true;
    if (!gesture && !interactionSettling) cleanup();
  };

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.cancelAnimationFrame(animationFrame);
    window.clearTimeout(navigationFallback);
    window.clearTimeout(temporaryStyleReset);
    window.clearTimeout(suppressClickReset);
    removeTransitionListener?.();
    if (gesture && surface.hasPointerCapture?.(gesture.pointerId)) {
      surface.releasePointerCapture?.(gesture.pointerId);
    }
    gesture = null;
    interactionSettling = false;
    surface.removeEventListener("pointerdown", handlePointerDown);
    surface.removeEventListener("pointermove", handlePointerMove);
    surface.removeEventListener("pointerup", handlePointerEnd);
    surface.removeEventListener("pointercancel", handlePointerEnd);
    surface.removeEventListener("click", handleClick, true);
    surface.removeEventListener("dragstart", handleDragStart);
    window.removeEventListener(reactReadyEvent, handleReactReady);
    Object.assign(surface.style, originalInlineStyles);
    if (window[bootstrapKey]?.cleanup === cleanup) delete window[bootstrapKey];
  };

  surface.addEventListener("pointerdown", handlePointerDown);
  surface.addEventListener("pointermove", handlePointerMove, { passive: false });
  surface.addEventListener("pointerup", handlePointerEnd);
  surface.addEventListener("pointercancel", handlePointerEnd);
  surface.addEventListener("click", handleClick, true);
  surface.addEventListener("dragstart", handleDragStart);
  window.addEventListener(reactReadyEvent, handleReactReady);

  window[bootstrapKey] = { cleanup, originalInlineStyles };
  performance.mark?.("civic-participant-swipe-bootstrap-ready");
})();
