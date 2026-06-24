import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error in component tree", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h2>Algo salió mal</h2>
          <p>Ocurrió un error inesperado en esta sección. Probá recargar la página.</p>
          <button onClick={() => window.location.reload()}>Recargar</button>
        </div>
      );
    }
    return this.props.children;
  }
}
