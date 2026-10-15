import { memo, useMemo, useRef, useState } from 'react';
import { FiAlertCircle, FiCheckCircle, FiGlobe } from 'react-icons/fi';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useDashboardData } from '../hooks/useDashboardData';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import ProgressBar from '../components/ui/ProgressBar';
import EmptyState from '../components/EmptyState';
import { extractCompanyFromUrl, analyzeUrlCompany } from '../utils/research';
import { riskTone } from '../utils/formatters';

function UrlResearch() {
  const { research, companies } = useDashboardData();
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);
  const latestUrlCompany = useMemo(() => companies.find((company) => company.data_source_url), [companies]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!url.trim()) return;
    try {
      const details = extractCompanyFromUrl(url.trim());
      setPreview({ details, analysis: analyzeUrlCompany(details), status: 'Ready' });
    } catch {
      setPreview(null);
    }
    research.analyzeUrl(url.trim());
  };

  const result = preview || (latestUrlCompany ? {
    details: {
      name: latestUrlCompany.name,
      industry: latestUrlCompany.sector,
      location: latestUrlCompany.location,
      website: latestUrlCompany.data_source_url,
      products: [latestUrlCompany.primaryCreditNeed],
      services: latestUrlCompany.predictive_needs?.map((need) => need.service_name) || [],
      about: latestUrlCompany.focus_area,
    },
    analysis: {
      opportunityScore: latestUrlCompany.opportunity_score,
      risk: latestUrlCompany.risk_state?.level || 'Low',
      creditNeeds: latestUrlCompany.creditRecommendations || [],
      suggestedProducts: latestUrlCompany.creditRecommendations?.map((item) => item.product) || [],
    },
  } : null);

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase text-blue-700">Individual URL Research</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Analyze one company</h2>
          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-slate-600">
              Website URL
              <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100 sm:flex-row">
                <input
                  ref={inputRef}
                  className="min-w-0 flex-1 bg-transparent px-4 py-2 text-sm text-slate-800 outline-none sm:py-0"
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://company.in"
                  required
                />
                <Button type="submit" disabled={research.isResearching}>{research.isResearching ? 'Analyzing' : 'Research'}</Button>
              </div>
            </label>
          </form>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              {research.status?.toLowerCase().includes('invalid') || research.status?.toLowerCase().includes('unreachable') ? (
                <FiAlertCircle className="h-5 w-5 text-rose-600" />
              ) : (
                <FiCheckCircle className="h-5 w-5 text-emerald-600" />
              )}
              <p className="font-semibold text-slate-900">Validation Status</p>
            </div>
            <p className="mt-2 text-sm text-slate-600">{research.status || 'Enter an HTTPS URL to verify status, redirects, SSL and reachability.'}</p>
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-xs font-semibold uppercase text-blue-700">Research Result</p>
          {result ? (
            <div className="mt-4 grid gap-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-700">
                    <FiGlobe className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-950">{result.details.name}</h3>
                    <p className="text-sm text-slate-500">{result.details.location} - {result.details.industry}</p>
                  </div>
                </div>
                <Badge tone={riskTone(result.analysis.risk)}>{result.analysis.risk} Risk</Badge>
              </div>
              <p className="text-sm leading-6 text-slate-600">{result.details.about}</p>
              <div>
                <div className="mb-2 flex justify-between text-sm font-semibold text-slate-600">
                  <span>Opportunity Score</span>
                  <span>{result.analysis.opportunityScore}</span>
                </div>
                <ProgressBar value={result.analysis.opportunityScore} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Info label="Website" value={result.details.website} />
                <Info label="Research Source" value="URL Verified" />
                <Info label="Products" value={result.details.products?.join(', ')} />
                <Info label="Services" value={result.details.services?.join(', ')} />
              </div>
              <div className="flex flex-wrap gap-2">
                {result.analysis.suggestedProducts?.map((product) => <Badge key={product} tone="info">{product}</Badge>)}
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                icon={MagnifyingGlassIcon}
                title="No URL Research Yet"
                message="Start researching a company URL to generate AI-powered banking insights."
                actionLabel="Research URL"
                onAction={() => inputRef.current?.focus()}
              />
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-2 overflow-wrap-anywhere text-sm font-semibold text-slate-800">{value || 'N/A'}</p>
    </div>
  );
}

export default memo(UrlResearch);
