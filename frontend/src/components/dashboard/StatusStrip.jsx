import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function StatusStrip({ status }) {
  return (
    <AnimatePresence>
      {status && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="border-b border-emerald-200 bg-emerald-50 px-6 py-3 text-sm font-semibold text-emerald-800"
          role="status"
        >
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          {status}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default memo(StatusStrip);
