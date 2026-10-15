import { useCallback, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createResearch, verifyWebsite } from '../services/api';
import { analyzeUrlCompany, buildSectorResearch, extractCompanyFromUrl } from '../utils/research';

export function useResearchWorkflow() {
  const queryClient = useQueryClient();
  const abortRef = useRef(null);
  const [status, setStatus] = useState('');
  const [activeKey, setActiveKey] = useState(null);
  const [activeSourceIds, setActiveSourceIds] = useState([]);
  const [history, setHistory] = useState([]);

  const mutation = useMutation({
    mutationFn: ({ payload, signal }) => createResearch(payload, signal),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recommendations'] }),
  });

  const pushHistory = useCallback((entry) => {
    setHistory((current) => [{ id: Date.now(), timestamp: new Date().toISOString(), ...entry }, ...current].slice(0, 8));
  }, []);

  const analyzeUrl = useCallback(async (url) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setActiveKey('url');

    try {
      setStatus('Verifying URL');
      const verification = await verifyWebsite(url, abortRef.current.signal);
      setStatus(`URL Verified: HTTP ${verification.statusCode}`);

      const details = extractCompanyFromUrl(verification.finalUrl || url);
      const analysis = analyzeUrlCompany(details);
      setStatus('Research Completed');

      await mutation.mutateAsync({
        signal: abortRef.current.signal,
        payload: {
          name: details.name,
          sector: details.industry,
          data_source_url: details.website,
          tags: `${details.industry.toLowerCase()},url-verified,ai-research`,
          opportunity_score: analysis.opportunityScore,
          risk_score: analysis.risk === 'Low' ? 25 : analysis.risk === 'Medium' ? 45 : 65,
        },
      });

      pushHistory({
        sector: details.industry,
        source: 'URL Research',
        companiesFound: 1,
        creditNeeds: analysis.suggestedProducts,
        status: 'Completed',
      });

      setStatus('Research Completed');
      window.setTimeout(() => setStatus(''), 3500);
    } catch (error) {
      setStatus(error.message || 'Invalid URL');
      pushHistory({
        sector: 'URL',
        source: 'URL Research',
        companiesFound: 0,
        creditNeeds: [],
        status: 'Failed',
      });
      window.setTimeout(() => setStatus(''), 5000);
    } finally {
      setActiveKey(null);
    }
  }, [mutation, pushHistory]);

  const analyzeSector = useCallback(async (sector) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setActiveKey(`sector:${sector}`);

    try {
      const research = buildSectorResearch(sector);
      setActiveSourceIds(research.sources.map((source) => source.id));
      setStatus(`Analyzing ${sector}`);

      await Promise.all(
        research.generatedLeads.map((lead) =>
          mutation.mutateAsync({
            signal: abortRef.current.signal,
            payload: {
              ...lead,
              data_sources: research.sources.map((source) => source.id),
              research_type: 'Sector Analysis',
            },
          })
        )
      );

      await queryClient.invalidateQueries({ queryKey: ['recommendations'] });

      pushHistory({
        sector,
        source: 'Sector Analysis',
        companiesFound: research.generatedLeads.length,
        creditNeeds: research.signals,
        status: 'Completed',
      });

      setStatus('Dashboard refreshed');
      window.setTimeout(() => setStatus(''), 3500);
    } catch (error) {
      setStatus(error.message || 'Sector research failed');
      pushHistory({
        sector,
        source: 'Sector Analysis',
        companiesFound: 0,
        creditNeeds: [],
        status: 'Failed',
      });
      window.setTimeout(() => setStatus(''), 5000);
    } finally {
      setActiveKey(null);
    }
  }, [mutation, pushHistory, queryClient]);

  return {
    activeKey,
    activeSourceIds,
    analyzeSector,
    analyzeUrl,
    history,
    isResearching: mutation.isPending,
    status,
  };
}
