import { memo } from 'react';
import {
  ArrowTopRightOnSquareIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import ProgressBar from '../ui/ProgressBar';
import { cn, riskTone } from '../../utils/formatters';

function CompanyCard({ company, selected, onSelect }) {
  const risk = company.risk_state?.level || 'Low';

  return (
    <button type="button" onClick={() => onSelect(company.id)} className="w-full min-w-0 text-left">
      <Card
        interactive
        className={cn(
          'p-6 shadow-lg ring-1 ring-transparent transition-all duration-200 hover:-translate-y-1 hover:shadow-xl',
          selected && 'border-blue-300 bg-blue-50/40 ring-blue-100'
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BuildingOffice2Icon className="h-5 w-5 text-blue-700" />
              <h3 className="truncate text-base font-bold text-slate-950">{company.name}</h3>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="info">{company.sector || 'Unassigned'}</Badge>
              <Badge tone={riskTone(risk)}>{risk} Risk</Badge>
              <Badge tone={company.execution_status === 'completed' ? 'success' : 'warning'}>
                {company.execution_status === 'completed' ? 'Completed' : 'Pending'}
              </Badge>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-center shadow-sm">
            <p className="text-xl font-bold text-blue-700">{company.opportunity_score}</p>
            <p className="text-[10px] font-semibold uppercase text-slate-400">Score</p>
          </div>
        </div>

        <div className="mt-4">
          <ProgressBar value={company.opportunity_score} />
        </div>

        <div className="mt-4 grid gap-4 text-sm text-slate-600 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Credit Need</p>
            <p className="font-semibold text-slate-800">{company.primaryCreditNeed}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Location</p>
            <p className="flex items-center gap-2 font-semibold text-slate-800">
              <MapPinIcon className="h-4 w-4" />
              {company.location}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {company.creditRecommendations?.map((item) => (
            <Badge key={item.product} tone={riskTone(item.risk)}>
              {item.product} {item.confidence}%
            </Badge>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <CheckCircleIcon className="h-4 w-4" />
              {company.identifiedFrom}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-2 text-xs font-semibold text-slate-600">
              Quick Action
            </span>
          </div>
          {company.data_source_url ? (
            <a
              href={company.data_source_url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="inline-flex shrink-0 items-center gap-2 text-xs font-bold text-blue-700 no-underline hover:no-underline"
            >
              Source
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
          ) : (
            <span className="text-xs font-bold text-blue-700">View Details</span>
          )}
        </div>
      </Card>
    </button>
  );
}

export default memo(CompanyCard);
