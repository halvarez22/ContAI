/**
 * ErrorBoundary de sección / raíz (H1 Endurecimiento).
 * Registra stack en consola; fallback no traga el error en silencio.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

export type ErrorBoundaryProps = {
  children: ReactNode;
  /** Etiqueta para logs (ej. root, tab-router) */
  label?: string;
  onReset?: () => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Error inesperado de renderizado',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(
      'ErrorBoundary caught:',
      error,
      errorInfo.componentStack,
      this.props.label ? `(${this.props.label})` : ''
    );
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: '' });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert">
          <Card className="p-6 space-y-4 max-w-lg mx-auto my-8">
            <h2 className="text-lg font-bold text-ink">Algo salió mal</h2>
            <p className="text-sm text-ink-muted">
              Esta sección falló al renderizar. El resto de ContAI puede seguir
              disponible. Detalle técnico en la consola del navegador.
            </p>
            <p className="text-xs font-mono text-ink-subtle break-words">
              {this.state.message}
            </p>
            <Button type="button" variant="secondary" onClick={this.handleReset}>
              Reintentar
            </Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
