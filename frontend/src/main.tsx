import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null, errorInfo: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: '#EF4444', backgroundColor: '#0F172A', padding: '40px', fontFamily: 'monospace', minHeight: '100vh', boxSizing: 'border-box' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', borderBottom: '2px solid #EF4444', paddingBottom: '10px', marginTop: 0 }}>
            CRITICAL REACT RENDERING CRASH
          </h1>
          <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '20px 0' }}>
            {this.state.error?.toString()}
          </p>
          <pre style={{ backgroundColor: '#1E293B', padding: '20px', borderRadius: '8px', overflowX: 'auto', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
            {this.state.error?.stack}
          </pre>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: '20px 0 10px 0', borderBottom: '1px solid #475569', paddingBottom: '5px' }}>
            React Component Stack:
          </h2>
          <pre style={{ backgroundColor: '#1E293B', padding: '20px', borderRadius: '8px', overflowX: 'auto', fontSize: '12px', whiteSpace: 'pre-wrap', color: '#38BDF8' }}>
            {this.state.errorInfo?.componentStack || 'Loading component stack...'}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
