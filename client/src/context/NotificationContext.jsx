import { createContext, useContext, useState, useCallback } from 'react';

const NotificationContext = createContext();

export function useNotifications() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now() + Math.random();
    setNotifications((prev) => [...prev, { id, message, type, createdAt: Date.now() }]);

    if (duration > 0) {
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const notify = {
    success: (msg, duration) => addNotification(msg, 'success', duration),
    error: (msg, duration) => addNotification(msg, 'error', duration || 8000),
    warning: (msg, duration) => addNotification(msg, 'warning', duration || 6000),
    info: (msg, duration) => addNotification(msg, 'info', duration),
  };

  return (
    <NotificationContext.Provider value={{ notifications, notify, removeNotification }}>
      {children}
      <NotificationStack notifications={notifications} onDismiss={removeNotification} />
    </NotificationContext.Provider>
  );
}

function NotificationStack({ notifications, onDismiss }) {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-md w-full pointer-events-none">
      {notifications.map((n) => (
        <NotificationItem key={n.id} notification={n} onDismiss={() => onDismiss(n.id)} />
      ))}
    </div>
  );
}

function NotificationItem({ notification, onDismiss }) {
  const styles = {
    success: { bg: 'bg-green-50 border-green-200', text: 'text-green-800', icon: '✅', bar: 'bg-green-500' },
    error: { bg: 'bg-red-50 border-red-200', text: 'text-red-800', icon: '❌', bar: 'bg-red-500' },
    warning: { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-800', icon: '⚠️', bar: 'bg-yellow-500' },
    info: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', icon: 'ℹ️', bar: 'bg-blue-500' },
  };

  const s = styles[notification.type] || styles.info;

  return (
    <div className={`pointer-events-auto ${s.bg} border rounded-xl shadow-lg overflow-hidden animate-in slide-in-from-right-5 duration-300`}>
      <div className="flex items-start gap-3 p-4">
        <span className="text-lg flex-shrink-0 mt-0.5">{s.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${s.text}`}>{notification.message}</p>
        </div>
        <button onClick={onDismiss} className={`flex-shrink-0 ${s.text} opacity-50 hover:opacity-100 transition-opacity`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className={`h-1 ${s.bar} animate-shrink`} />
    </div>
  );
}