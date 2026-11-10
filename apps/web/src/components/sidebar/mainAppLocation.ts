import { useNavigate, type AnyRouter } from "@tanstack/react-router";

import { GUEST_PAGE_PATH } from "../../guestPage";
import { withoutAssistantCitationHash } from "../../lib/assistantCitationNavigation";

/** Settings and Usage open as modals over the last main-app view. */
export function isAppModalPage(pathname: string) {
  return pathname === "/settings" || pathname.startsWith("/settings/") || pathname === "/usage";
}

export function isSidebarUtilityPage(pathname: string) {
  return pathname.startsWith("/projects/") || pathname === "/pull-requests";
}

// Pages the root route always renders without the app shell, so they are never
// a page to return to. Other paths seen before auth or on a prompt-link landing
// are still recorded; they are real app URLs, so returning to one is harmless.
const SHELL_LESS_PATHS = new Set(["/pair", "/connect", "/connect-agent", GUEST_PAGE_PATH]);

let mainAppHref: string | null = null;
let appModalReturnHref: string | null = null;
let appModalKeyboardOpener: HTMLElement | null = null;

/** Remembers where Settings, Usage, and the utility pages lead back to. */
export function startMainAppLocationTracking(router: AnyRouter): () => void {
  const record = () => {
    const { pathname } = router.state.location;
    if (isAppModalPage(pathname) || SHELL_LESS_PATHS.has(pathname)) return;
    const href = withoutAssistantCitationHash(router.state.location.href);
    const opener = href === appModalReturnHref ? appModalKeyboardOpener : null;
    appModalKeyboardOpener = null;
    if (opener?.isConnected && document.activeElement === document.body) {
      opener.focus({ preventScroll: true });
    }
    appModalReturnHref = href;
    if (!isSidebarUtilityPage(pathname)) mainAppHref = href;
  };
  record();
  const stopRecording = router.subscribe("onResolved", record);
  const stopCapturingOpener = router.subscribe(
    "onBeforeNavigate",
    ({ fromLocation, toLocation }) => {
      if (
        (fromLocation !== undefined && isAppModalPage(fromLocation.pathname)) ||
        !isAppModalPage(toLocation.pathname)
      )
        return;
      const focused = document.activeElement;
      appModalKeyboardOpener =
        focused instanceof HTMLElement && focused.matches(":focus-visible") ? focused : null;
    },
  );
  return () => {
    stopRecording();
    stopCapturingOpener();
    appModalKeyboardOpener = null;
  };
}

export function useNavigateToMainApp() {
  const navigate = useNavigate();
  return () => navigate({ href: mainAppHref ?? "/" });
}

/** Leaves Settings or Usage for the page that opened it. */
export function useCloseAppModal() {
  const navigate = useNavigate();
  return () => navigate({ href: appModalReturnHref ?? mainAppHref ?? "/" });
}
