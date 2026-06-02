import React from 'react';
import { useToast } from '../context/ToastContext';

const ToastViewport = () => {
  const { toasts, dismissToast } = useToast();

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-item toast-${toast.kind}`}>
          <span>{toast.message}</span>
          <button type="button" onClick={() => dismissToast(toast.id)}>
            Close
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastViewport;
