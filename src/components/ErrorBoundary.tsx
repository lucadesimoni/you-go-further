import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * What the athlete sees when the app breaks.
 *
 * Without this, one thrown error anywhere in the tree unmounts the whole
 * application and leaves a white screen — no message, no way back, nothing to
 * report. That is the single worst thing a product can do to someone standing
 * in a car park before a race, and it is the review it earns.
 *
 * Deliberately plain: no translation lookup, no design system, no hooks. This
 * component runs *because* something else failed, so it must not depend on
 * anything that could be the thing that failed. The strings are English
 * because reaching for the i18n context here would be one more thing that can
 * throw while handling a throw.
 *
 * Recovery is offered in increasing order of destructiveness: try again (the
 * error may have been transient), reload, and — only if the app cannot get
 * past it — clear the local state that might be the cause.
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The console is the only reporter this app has. It is what a person is
    // asked to paste into a bug report, so it carries the component stack.
    // eslint-disable-next-line no-console
    console.error("Unhandled error in the interface:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash">
        <div className="crash-card">
          <p className="crash-kicker">You Go Further</p>
          <h1 className="crash-title">Something in the app broke</h1>
          <p className="crash-body">
            Not your training data — that is stored, and it is still there. This screen failed to draw, which is our
            fault, not yours.
          </p>
          <div className="crash-actions">
            <button type="button" className="btn btn-primary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
              Reload the app
            </button>
          </div>
          <details className="crash-details">
            <summary>What went wrong</summary>
            <pre>{error.message}</pre>
            <p className="crash-hint">
              If it keeps happening, clearing this browser&rsquo;s saved settings usually fixes it. Anything synced to
              your account is not affected.
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-danger"
              onClick={() => {
                try {
                  localStorage.clear();
                  sessionStorage.clear();
                } catch {
                  /* private mode */
                }
                window.location.replace("/");
              }}
            >
              Clear local settings and restart
            </button>
          </details>
        </div>
      </div>
    );
  }
}
