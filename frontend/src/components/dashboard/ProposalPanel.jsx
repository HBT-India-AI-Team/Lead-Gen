import { memo } from 'react';
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  CursorArrowRaysIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import ProgressBar from '../ui/ProgressBar';
import EmptyState from '../EmptyState';
import { riskTone } from '../../utils/formatters';

function ProposalPanel({ company, onApprove, isApproving }) {
  return (
    <aside className="min-w-0 rounded-2xl border border-white/70 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase text-blue-700">Proposal</p>
        <h2 className="mt-2 text-xl font-bold text-slate-950">{company?.name || 'Select Company'}</h2>
      </div>

      {!company ? (
        <EmptyState
          compact
          icon={CursorArrowRaysIcon}
          title="No Lead Selected"
          message="Choose a company from the lead queue to review recommended products and proposal drafts."
          actionLabel="View Leads"
          actionTo="/companies"
        />
      ) : company.proposals?.length ? (
        <div className="grid gap-4">
          {company.proposals.map((proposal) => {
            const approved = proposal.status === 'approved';
            const recommendation = company.creditRecommendations?.[0];
            return (
              <Card key={proposal.id} className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-950">{recommendation?.product || company.primaryCreditNeed}</p>
                    <p className="mt-2 text-xs text-slate-500">Recommended Product</p>
                  </div>
                  <Badge tone={approved ? 'success' : 'warning'}>{approved ? 'Approved' : 'Pending'}</Badge>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-400">AI Summary</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{proposal.proposal_summary}</p>
                </div>

                {recommendation && (
                  <div className="mt-4 grid gap-4">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                      <span>Confidence</span>
                      <span>{recommendation.confidence}%</span>
                    </div>
                    <ProgressBar value={recommendation.confidence} />
                    <Badge tone={riskTone(recommendation.risk)}>{recommendation.risk} Risk</Badge>
                    <p className="text-sm text-slate-600">{recommendation.reason}</p>
                  </div>
                )}

                <label className="mt-4 block text-xs font-semibold uppercase text-slate-400">
                  Email Preview
                  <textarea
                    className="mt-2 min-h-40 w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 text-sm normal-case leading-6 text-slate-700 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                    defaultValue={proposal.email_draft}
                    disabled={approved}
                  />
                </label>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <Button type="button" disabled={approved || isApproving} onClick={() => onApprove(proposal.id)}>
                    {approved ? <CheckCircleIcon className="h-4 w-4" /> : <PaperAirplaneIcon className="h-4 w-4" />}
                    {approved ? 'Sent' : 'Approve'}
                  </Button>
                  <Button type="button" variant="secondary">
                    <PencilSquareIcon className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button type="button" variant="secondary">
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    PDF
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          compact
          icon={DocumentTextIcon}
          title="No Proposal Yet"
          message="This lead has no generated proposal yet. Use the company actions to prepare a draft."
          actionLabel="Review Lead"
          actionTo="/companies"
        />
      )}
    </aside>
  );
}

export default memo(ProposalPanel);