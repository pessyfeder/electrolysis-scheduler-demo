import { Toaster } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useNavigate,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AdminGate, LockProvider, useLock } from "../lib/lock";
import { StoreProvider } from "../lib/store";
import { Nav } from "../components/Nav";
import { ActiveSessionBanner } from "../components/ActiveSessionBanner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Electrolysis Scheduler — Scheduling" },
      { name: "description", content: "Appointment scheduling for an electrolysis studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "theme-color", content: "#33724c" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Outfit:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Saves the app on the device so it opens without internet (see public/sw.js). Production only, and not
 * inside the Lovable editor preview (an iframe), where a cached copy would hide new edits.
 */
function useOfflineSupport() {
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator) || window.self !== window.top) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("Offline support unavailable", error));
  }, []);
}

/** The app always opens on the public Book Appointment screen; Admin is one tap (and the password) away. */
function useOpenOnBook() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!window.location.pathname.startsWith("/book")) void navigate({ to: "/book", search: { edit: undefined }, replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useOfflineSupport();
  useOpenOnBook();

  return (
    <QueryClientProvider client={queryClient}>
      <LockProvider>
        <StoreProvider>
          <Nav />
          <GatedContent />
          <Toaster position="top-center" richColors />
        </StoreProvider>
      </LockProvider>
    </QueryClientProvider>
  );
}

/** Book is public; every other page sits behind the Admin password. */
function GatedContent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { status } = useLock();
  const isPublic = pathname.startsWith("/book") ? status !== "unlocked" : false;
  if (pathname.startsWith("/book")) {
    return <><ActiveSessionBanner isPublic={isPublic} /><Outlet /></>;
  }
  return <AdminGate><ActiveSessionBanner /><Outlet /></AdminGate>;
}
