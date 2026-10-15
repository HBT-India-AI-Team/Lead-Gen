import { memo, useMemo, useState } from 'react';
import { useDashboardData } from '../hooks/useDashboardData';
import { useDebounce } from '../hooks/useDebounce';
import { SECTORS } from '../constants/dashboard';
import { HiOutlineOfficeBuilding } from 'react-icons/hi';
import CompanyCard from '../components/dashboard/CompanyCard';
import ProposalPanel from '../components/dashboard/ProposalPanel';
import SearchBar from '../components/SearchBar';
import Button from '../components/ui/Button';
import EmptyState from '../components/EmptyState';
import { CardSkeleton } from '../components/ui/Skeleton';

function Companies() {
  const {
    approvalMutation,
    companies,
    minScore,
    recommendationsQuery,
    resetFilters,
    sector,
    selectedCompany,
    selectedCompanyId,
    setMinScore,
    setSector,
    setSelectedCompanyId,
  } = useDashboardData();
  const [search, setSearch] = useState('');
  const [risk, setRisk] = useState('All');
  const [sort, setSort] = useState('score-desc');
  const debouncedSearch = useDebounce(search, 250);

  const filteredCompanies = useMemo(() => {
    const value = debouncedSearch.trim().toLowerCase();
    return [...companies]
      .filter((company) => {
        const matchesSearch = !value || [company.name, company.sector, company.primaryCreditNeed, company.location].some((field) => String(field || '').toLowerCase().includes(value));
        const matchesRisk = risk === 'All' || company.risk_state?.level === risk;
        return matchesSearch && matchesRisk;
      })
      .sort((a, b) => {
        if (sort === 'score-asc') return a.opportunity_score - b.opportunity_score;
        if (sort === 'name') return a.name.localeCompare(b.name);
        return b.opportunity_score - a.opportunity_score;
      });
  }, [companies, debouncedSearch, risk, sort]);

  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border border-white/70 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-blue-700">Companies</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">Discovered Companies</h2>
          </div>
          <div className="grid w-full min-w-0 gap-4 md:grid-cols-2 xl:w-auto xl:grid-cols-[repeat(4,minmax(0,1fr))]">
            <SearchBar value={search} onChange={setSearch} placeholder="Search companies" />
            <select className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100" value={sector} onChange={(event) => setSector(event.target.value)}>
              <option value="All">All Sectors</option>
              {SECTORS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100" value={risk} onChange={(event) => setRisk(event.target.value)}>
              <option value="All">All Risk</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
            <select className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="score-desc">Score high</option>
              <option value="score-asc">Score low</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>
        <label className="mt-4 grid max-w-sm gap-2 text-xs font-semibold uppercase text-slate-500">
          Score Filter {minScore}
          <input className="accent-blue-700" type="range" min="50" max="95" step="5" value={minScore} onChange={(event) => setMinScore(Number(event.target.value))} />
        </label>
      </section>

      <section className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,55fr)_minmax(20rem,45fr)] 2xl:grid-cols-[minmax(0,55fr)_minmax(22rem,45fr)]">
        <div className="grid gap-4">
          {recommendationsQuery.isLoading ? (
            Array.from({ length: 4 }).map((_, index) => <CardSkeleton key={index} />)
          ) : filteredCompanies.length ? (
            filteredCompanies.map((company) => (
              <div key={company.id} className="grid gap-4">
                <CompanyCard company={company} selected={company.id === selectedCompanyId} onSelect={setSelectedCompanyId} />
                <div className="flex flex-wrap gap-2 px-0">
                  <Button type="button" variant="secondary" onClick={() => setSelectedCompanyId(company.id)}>View Details</Button>
                  <Button type="button" variant="secondary" onClick={() => setSelectedCompanyId(company.id)}>Generate Proposal</Button>
                  <Button type="button" variant="secondary">Research Again</Button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState icon={HiOutlineOfficeBuilding} title="No Companies Found" message="Adjust your filters or run sector research to discover qualified banking leads." actionLabel="Reset Filters" onAction={resetFilters} />
          )}
        </div>
        <ProposalPanel company={selectedCompany} isApproving={approvalMutation.isPending} onApprove={approvalMutation.mutate} />
      </section>
    </div>
  );
}

export default memo(Companies);
