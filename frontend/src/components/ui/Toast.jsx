import { memo } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import Badge from './Badge';

function Toast({ alert, onClose }) {
  return (
    <AnimatePresence>
      {alert && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          className="fixed bottom-5 right-5 z-50 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-white/80 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur"
          role="alert"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Badge tone={alert.type === 'error' ? 'danger' : 'success'}>{alert.type || 'Info'}</Badge>
              <h3 className="mt-2 text-sm font-bold text-slate-950">{alert.title}</h3>
            </div>
            <button className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={onClose} type="button">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-600">{alert.message}</p>
          {alert.details && (
            <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
              <span>Status: {alert.details.status}</span>
              <span>Recipient: {alert.details.recipient}</span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default memo(Toast);
