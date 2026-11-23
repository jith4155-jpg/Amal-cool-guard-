import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let displayMessage = error?.message || 'An unexpected application error occurred.';
    try {
      const parsed = JSON.parse(displayMessage);
      if (parsed && typeof parsed.error === 'string') {
        displayMessage = `${parsed.error} (${parsed.operationType || 'read/write'} on ${parsed.path || 'database'})`;
      }
    } catch {
      // keep raw message
    }
    return {
      hasError: true,
      errorMessage: displayMessage,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-lg border border-red-200 max-w-md w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-2xl mx-auto">
              ⚠️
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-extrabold text-gray-900">Something went wrong</h2>
              <p className="text-xs text-gray-600 leading-relaxed break-words">
                {this.state.errorMessage}
              </p>
            </div>
            <div className="flex gap-2 justify-center pt-1">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, errorMessage: '' })}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => window.location.assign('/')}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-xl transition"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
