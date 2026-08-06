import { createContext, use, useCallback, useState, type ReactNode } from 'react';
import { FiAlertCircle, FiCheckCircle } from 'react-icons/fi';
import { clsx } from 'clsx';
import styles from './Toast.module.scss';

interface ToastItem {
  id: number;
  kind: 'success' | 'error';
  message: string;
}

interface ToastContextValue {
  show: (kind: ToastItem['kind'], message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((kind: ToastItem['kind'], message: string) => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setItems((prev) => prev.filter((item) => item.id !== id)), 4000);
  }, []);

  return (
    <ToastContext value={{ show }}>
      {children}
      <div className={styles.stack}>
        {items.map((item) => (
          <div key={item.id} role="status" className={clsx(styles.toast, item.kind === 'success' ? styles['toast--success'] : styles['toast--error'])}>
            {item.kind === 'success' ? <FiCheckCircle /> : <FiAlertCircle />}
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastContextValue {
  const ctx = use(ToastContext);
  if (!ctx) throw new Error('useToast, ToastProvider dışında çağrıldı');
  return ctx;
}
