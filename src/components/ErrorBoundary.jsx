import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-stone-50">
        <div className="max-w-md w-full bg-white rounded-xl border border-red-200 p-6 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-red-100 text-red-700 flex items-center justify-center text-2xl mb-3">⚠️</div>
          <h2 className="text-base font-display font-bold text-stone-900 mb-2">حدث خطأ غير متوقّع</h2>
          <p className="text-xs text-stone-600 mb-4">
            النظام يعمل، لكن جزءاً واحداً تعطّل. تستطيع المحاولة مجدّداً أو إعادة تحميل الصفحة.
          </p>
          {this.state.error?.message && (
            <pre dir="ltr" className="text-[10px] bg-stone-100 border border-stone-200 rounded-lg p-2 mb-4 overflow-x-auto text-left text-stone-700">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-2 justify-center">
            <button onClick={this.reset}
              className="px-4 py-2 bg-brand-blue text-white text-xs rounded-lg hover:bg-blue-700">
              المحاولة مجدّداً
            </button>
            <button onClick={this.reload}
              className="px-4 py-2 border border-stone-300 text-xs rounded-lg hover:bg-stone-100">
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      </div>
    );
  }
}
