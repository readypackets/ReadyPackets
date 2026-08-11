/**
 * Client entrypoint.
 *
 * Providers are ordered deliberately: the query client wraps tRPC, tRPC wraps the
 * session, and the session wraps the router, because every route decision depends
 * on the session, which in turn depends on a working transport.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, createTrpcClient } from "@/lib/trpc";
import { SessionProvider } from "@/lib/session";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/components/ui/Toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { App } from "@/App";
import "@/styles/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data here is operational rather than real-time; a short stale window keeps
      // the interface responsive without hammering the server.
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Never retry an authorisation failure: it will not succeed, and repeated
        // attempts only feed the rate limiter.
        const message = error instanceof Error ? error.message : "";
        if (message.includes("UNAUTHORIZED") || message.includes("FORBIDDEN")) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

const trpcClient = createTrpcClient();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container is missing from the document.");
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <SessionProvider>
                <App />
              </SessionProvider>
            </ToastProvider>
          </QueryClientProvider>
        </trpc.Provider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
