import { memo, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClockIcon } from '@heroicons/react/24/outline';
import { useDashboardData } from '../hooks/useDashboardData';
import TimelineCard from '../components/TimelineCard';
import EmptyState from '../components/EmptyState';

const ranges = ['Today', 'Last 7 Days', 'Last Month', 'All'];

function ResearchHistory() {
  const { research } = useDashboardData();
  const [range, setRange] = useState('All');
  const navigate = useNavigate();

  const items = useMemo(() => {
    const now = Date.now();
    return research.history.filter((item) => {
      if (range === 'All') return true;
      const time = new Date(item.timestamp).getTime();
      if (range === 'Today') return now - time < 24 * 60 * 60 * 1000;
      if (range === 'Last 7 Days') return now - time < 7 * 24 * 60 * 60 * 1000;
      return now - time < 30 * 24 * 60 * 60 * 1000;
    });
  }, [range, research.history]);

  return (
    <div className="grid w-full min-w-0 justify-items-stretch gap-6">
      <section className="w-full rounded-2xl border border-white/70 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-blue-700">Research History</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">Timeline</h2>
          </div>
          <div className="flex flex-wrap gap-2 xl:pb-1">
            {ranges.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRange(item)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${range === item ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700'}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid w-full min-w-0 gap-4">
        {items.length ? items.map((item) => <TimelineCard key={item.id} item={item} />) : (
          <EmptyState
            icon={ClockIcon}
            title="No Research History"
            message="Run URL or sector research to build the timeline of analyzed companies."
            actionLabel="Research Company"
            onAction={() => navigate('/url-research')}
          />
        )}
      </section>
    </div>
  );
}

export default memo(ResearchHistory);