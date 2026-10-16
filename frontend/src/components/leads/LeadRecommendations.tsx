import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CircleSlash, Loader2, Sparkles } from 'lucide-react';
import { fetchLeadRecommendations } from '../../services/leadsApi';

// "Recommended Banking Products" + "Relationship Strategy" on Lead Details,
// from GET /api/leads/:id/recommendations: the Gemini proposal agent's pick
// when a proposal exists, the product catalog match for the opportunity,
// and a next step from the lead's real pipeline position. Each item shows
// its source.

interface Recommendations {
  aiRecommendation: { product: string; reason: string | null; proposalStatus: string; source: string } | null;
  catalogMatches: { products: string[]; opportunityType: string; source: string };
  strategy: { financingNeed: string; talkingPoints: string[]; missingInformation: string[]; nextStep: string };
}

function Label({ children }: { children: string }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{children}</p>;
}

export default function LeadRecommendations({ tenderId }: { tenderId: string }) {
  const query = useQuery({
    queryKey: ['lead-recommendations', tenderId],
    queryFn: () => fetchLeadRecommendations(tenderId) as Promise<Recommendations>,
  });

  if (query.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" /> Loading recommendations…
      </p>
    );
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-ink-muted">Recommendations couldn&apos;t be loaded.</p>;
  }

  const { aiRecommendation, catalogMatches, strategy } = query.data;

  return (
    <>
      <div>
        <Label>Recommended Banking Products</Label>
        {aiRecommendation && (
          <div className="mt-2 rounded-xl border border-primary-tint-2 bg-primary-tint/40 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Sparkles className="h-4 w-4 text-primary" strokeWidth={2} aria-hidden="true" />
              {aiRecommendation.product}
            </p>
            {aiRecommendation.reason && <p className="mt-1 text-sm text-ink-soft">{aiRecommendation.reason}</p>}
            <p className="mt-1 text-[11px] text-ink-muted">{aiRecommendation.source} · proposal {aiRecommendation.proposalStatus}</p>
          </div>
        )}
        <ul className="mt-2 grid gap-1.5">
          {catalogMatches.products.map((product) => (
            <li key={product} className="flex gap-2 text-sm text-ink">
              <span className="text-ink-muted" aria-hidden="true">•</span> {product}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[11px] text-ink-muted">{catalogMatches.source} ({catalogMatches.opportunityType}).</p>
      </div>

      <div>
        <Label>Relationship Strategy</Label>
        <div className="mt-2 grid gap-2 text-sm">
          <p className="text-ink">
            <span className="font-semibold">Likely financing need:</span> <span className="text-ink-soft">{strategy.financingNeed}.</span>
          </p>
          {strategy.talkingPoints.length > 0 && (
            <div>
              <p className="font-semibold text-ink">Talking points (from the AI proposal)</p>
              <ul className="mt-1 grid gap-1">
                {strategy.talkingPoints.map((point) => (
                  <li key={point} className="flex gap-2 text-ink-soft">
                    <span className="text-ink-muted" aria-hidden="true">•</span> {point}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {strategy.missingInformation.length > 0 && (
            <p className="flex items-start gap-2 text-ink-soft">
              <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" strokeWidth={2} aria-hidden="true" />
              <span>
                <span className="font-semibold text-ink">Still unknown:</span> {strategy.missingInformation.join(', ')}
              </span>
            </p>
          )}
          <p className="flex items-start gap-2 font-medium text-ink">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2} aria-hidden="true" />
            {strategy.nextStep}
          </p>
        </div>
      </div>
    </>
  );
}
