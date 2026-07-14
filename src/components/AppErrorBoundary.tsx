import React from 'react';

type State = { error: Error | null };

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Football Arena failed to render.', error, info);
  }

  private recover = () => {
    window.location.assign('/setup');
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="app-main">
        <section className="card" role="alert">
          <h1>Match could not continue</h1>
          <p>{this.state.error.message || 'An unexpected local error occurred.'}</p>
          <button className="button" onClick={this.recover}>Return to Team Setup</button>
        </section>
      </main>
    );
  }
}
