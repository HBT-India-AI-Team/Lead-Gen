import { memo } from 'react';
import { BuildingOffice2Icon, FunnelIcon } from '@heroicons/react/24/outline';
import { SECTORS } from '../../constants/dashboard';
import { CardSkeleton } from '../ui/Skeleton';
import CompanyCard from './CompanyCard';
import EmptyState from '../EmptyState';

function LeadQueue({
  companies,
  isLoading,
  minScore,
  sector,
  selectedCompanyId,
  onMinScoreChange,
  onSectorChange,
  onSelectCompany,
  onReset,
}) {
  return (
    <section className="rounded-2xl border border-white/70 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase text-blue-700">
            <FunnelIcon className="h-4 w-4" />
            Companies
          </p>
          <h2 className="mt-2 text-xl font-bold text-slate-950">Lead Queue</h2>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="grid gap-2 text-xs font-semibold uppercase text-slate-500">
            Sector
            <select className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm normal-case text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100" value={sector} onChange={(event) => onSectorChange(event.target.value)}>
              <option value="All">All</option>
              {SECTORS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="grid min-w-48 gap-2 text-xs font-semibold uppercase text-slate-500">
            Min Score {minScore}
            <input className="accent-blue-700" type="range" min="50" max="95" step="5" value={minScore} onChange={(event) => onMinScoreChange(Number(event.target.value))} />
          </label>
        </div>
      </div>

      {isLoading && companies.length === 0 ? (
        <div className="grid gap-4">
          {Array.from({ length: 4 }).map((_, index) => <CardSkeleton key={index} />)}
        </div>
      ) : companies.length === 0 ? (
        <EmptyState
          icon={BuildingOffice2Icon}
          title="No Leads Found"
          message="Run sector analysis or lower the score threshold to bring qualified leads back into view."
          actionLabel="Reset Filters"
          onAction={onReset}
        />
      ) : (
        <div className="grid max-h-[760px] gap-4 overflow-auto pr-2">
          {companies.map((company) => (
            <CompanyCard
              key={company.id}
              company={company}
              selected={company.id === selectedCompanyId}
              onSelect={onSelectCompany}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default memo(LeadQueue);
