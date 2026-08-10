/**
 * Top-level error boundary.
 *
 * A render fault shows a recoverable panel rather than a blank page, and the
 * message shown to the user never includes the stack trace: in production that
 * would disclose module paths and internal structure.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button, LinkButton } from "./ui/Button";

interface Props {
  children: ReactNode;
  /** Label used to distinguish which region failed in the log. */
  region?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept in the browser console only; there is no third-party error reporter,
    // by design, because this deployment must make no external requests.
    console.error(`[${this.props.region ?? "app"}] render error`, error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg rounded-[var(--radius-card)] border border-line bg-white p-6 text-center shadow-[var(--shadow-card)]">
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-warning/12 text-warning">
            <TriangleAlert className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-semibold text-ink">Something went wrong</h1>
          <p className="mt-2 text-sm text-body">
            This part of the page failed to load. Your work has not been lost — try again, and if
            the problem persists, contact support and we will investigate.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button
              onClick={this.reset}
              leadingIcon={<RefreshCw className="size-4" aria-hidden="true" />}
            >
              Try again
            </Button>
            <LinkButton variant="outline" href="/">
              Return home
            </LinkButton>
          </div>
        </div>
      </div>
    );
  }
}
