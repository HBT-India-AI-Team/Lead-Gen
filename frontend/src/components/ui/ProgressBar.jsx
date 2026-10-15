import { memo } from 'react';
import { clampScore } from '../../utils/formatters';

function ProgressBar({ value }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-blue-500 to-blue-700 transition-all duration-500"
        style={{ width: `${clampScore(value)}%` }}
      />
    </div>
  );
}

export default memo(ProgressBar);
