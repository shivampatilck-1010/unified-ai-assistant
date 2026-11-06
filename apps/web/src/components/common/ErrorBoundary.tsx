import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: '32px',
            color: '#FAF9F5',
            backgroundColor: '#070709',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              padding: '24px 32px',
              maxWidth: '480px',
              backgroundColor: '#0e0e13',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            }}
          >
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600 }}>
              {this.props.fallbackTitle || 'Unable to display view'}
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
              {this.state.error?.message || 'An unexpected rendering error occurred in this view.'}
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(217, 119, 87, 0.15)',
                border: '1px solid rgba(217, 119, 87, 0.4)',
                color: '#D97757',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Reset & Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
