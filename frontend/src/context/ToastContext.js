import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

let toastCounter = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback((message, kind = 'info', duration = 3000) => {
    const id = toastCounter;
    toastCounter += 1;

    setToasts((previous) => [...previous, { id, message, kind }]);

    window.setTimeout(() => {
      setToasts((previous) => previous.filter((item) => item.id !== id));
    }, duration);
  }, []);

  const value = useMemo(
    () => ({
      toasts,
      pushToast,
      dismissToast,
      success: (message) => pushToast(message, 'success'),
      error: (message) => pushToast(message, 'error', 4500),
      info: (message) => pushToast(message, 'info')
    }),
    [toasts, pushToast, dismissToast]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
