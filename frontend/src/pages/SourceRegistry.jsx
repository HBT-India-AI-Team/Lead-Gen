import { memo, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  HiOutlineDatabase,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlinePlay,
  HiOutlinePlus,
} from 'react-icons/hi';
import {
  createSource,
  deleteSource,
  fetchSources,
  runSource,
  updateSource,
  updateSourceHealth,
  updateSourcePriority,
  updateSourceStatus,
} from '../services/sourceRegistryApi';
import { useDebounce } from '../hooks/useDebounce';
import { formatDateTime, cn } from '../utils/formatters';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import Toast from '../components/ui/Toast';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';

const CATEGORIES = ['Government', 'Tender', 'Startup', 'News', 'Finance', 'Company', 'Other'];
const HEALTH_STATUSES = ['Healthy', 'Warning', 'Offline'];
const HEALTH_TONE = { Healthy: 'success', Warning: 'warning', Offline: 'danger' };

const SORT_OPTIONS = [
  { value: 'created_at-desc', label: 'Newest Added', sortBy: 'created_at', order: 'desc' },
  { value: 'priority-desc', label: 'Priority (High → Low)', sortBy: 'priority', order: 'desc' },
  { value: 'priority-asc', label: 'Priority (Low → High)', sortBy: 'priority', order: 'asc' },
  { value: 'last_run-desc', label: 'Last Run (Newest)', sortBy: 'last_run', order: 'desc' },
  { value: 'last_run-asc', label: 'Last Run (Oldest)', sortBy: 'last_run', order: 'asc' },
  { value: 'source_name-asc', label: 'Name (A → Z)', sortBy: 'source_name', order: 'asc' },
];

const EMPTY_FORM = {
  source_name: '',
  base_url: '',
  category: 'Other',
  country: '',
  crawl_frequency: 'Daily',
  enabled: true,
  health_status: 'Healthy',
  description: '',
  priority: 0,
};

const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100';
const labelClass = 'grid gap-1.5 text-xs font-semibold uppercase text-slate-500';

function SourceFormModal({ open, initialValue, onClose, onSubmit, submitting, serverError }) {
  const [form, setForm] = useState(initialValue || EMPTY_FORM);
  const [clientError, setClientError] = useState('');

  useMemo(() => {
    setForm(initialValue || EMPTY_FORM);
    setClientError('');
  }, [initialValue, open]);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setClientError('');

    if (!form.source_name.trim()) {
      setClientError('Source name is required.');
      return;
    }
    if (!form.base_url.trim()) {
      setClientError('Base URL is required.');
      return;
    }
    try {
      const url = new URL(form.base_url.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    } catch {
      setClientError('Base URL must be a valid http(s) URL.');
      return;
    }
    if (form.priority !== '' && (!Number.isInteger(Number(form.priority)) || Number(form.priority) < 0)) {
      setClientError('Priority must be a non-negative integer.');
      return;
    }

    onSubmit({
      ...form,
      priority: Number(form.priority) || 0,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialValue ? 'Edit Source' : 'Add Source'}
      subtitle="Trusted sources are read by the AI pipeline instead of hardcoded URLs."
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="source-form" disabled={submitting}>
            {submitting ? 'Saving…' : initialValue ? 'Save Changes' : 'Add Source'}
          </Button>
        </>
      )}
    >
      <form id="source-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
        <label className={cn(labelClass, 'sm:col-span-2')}>
          Source Name *
          <input className={inputClass} value={form.source_name} onChange={(event) => set('source_name', event.target.value)} placeholder="e.g. GeM" />
        </label>
        <label className={cn(labelClass, 'sm:col-span-2')}>
          Base URL *
          <input className={inputClass} value={form.base_url} onChange={(event) => set('base_url', event.target.value)} placeholder="https://example.gov.in" />
        </label>
        <label className={labelClass}>
          Category
          <select className={inputClass} value={form.category} onChange={(event) => set('category', event.target.value)}>
            {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className={labelClass}>
          Country
          <input className={inputClass} value={form.country || ''} onChange={(event) => set('country', event.target.value)} placeholder="India" />
        </label>
        <label className={labelClass}>
          Crawl Frequency
          <input className={inputClass} value={form.crawl_frequency || ''} onChange={(event) => set('crawl_frequency', event.target.value)} placeholder="Daily" />
        </label>
        <label className={labelClass}>
          Priority
          <input className={inputClass} type="number" min="0" value={form.priority} onChange={(event) => set('priority', event.target.value)} />
        </label>
        <label className={labelClass}>
          Health Status
          <select className={inputClass} value={form.health_status} onChange={(event) => set('health_status', event.target.value)}>
            {HEALTH_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="grid items-end gap-1.5 text-xs font-semibold uppercase text-slate-500">
          Status
          <label className="flex h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold normal-case text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-blue-700" checked={Boolean(form.enabled)} onChange={(event) => set('enabled', event.target.checked)} />
            {form.enabled ? 'Enabled' : 'Disabled'}
          </label>
        </label>
        <label className={cn(labelClass, 'sm:col-span-2')}>
          Description
          <textarea className={cn(inputClass, 'h-24 resize-none py-3')} value={form.description || ''} onChange={(event) => set('description', event.target.value)} placeholder="What this source is used for" />
        </label>
        {(clientError || serverError) && (
          <p className="text-xs font-semibold text-rose-600 sm:col-span-2">{clientError || serverError}</p>
        )}
      </form>
    </Modal>
  );
}

function DeleteConfirmModal({ open, source, onClose, onConfirm, submitting }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete Source"
      size="sm"
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" className="bg-rose-600 shadow-rose-900/15 hover:bg-rose-700" onClick={onConfirm} disabled={submitting}>
            {submitting ? 'Deleting…' : 'Delete'}
          </Button>
        </>
      )}
    >
      <p className="text-sm text-slate-600">
        Are you sure you want to delete <span className="font-semibold text-slate-900">{source?.source_name}</span>? This cannot be undone.
      </p>
    </Modal>
  );
}

function SourceRegistry() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [enabledFilter, setEnabledFilter] = useState('All');
  const [sortValue, setSortValue] = useState('created_at-desc');
  const [page, setPage] = useState(1);
  const [alert, setAlert] = useState(null);
  const [formModal, setFormModal] = useState({ open: false, source: null });
  const [deleteModal, setDeleteModal] = useState({ open: false, source: null });
  const limit = 10;

  const debouncedSearch = useDebounce(search, 300);
  const sortOption = SORT_OPTIONS.find((option) => option.value === sortValue) || SORT_OPTIONS[0];

  function showToast(type, title, message) {
    setAlert({ type, title, message });
  }

  const sourcesQuery = useQuery({
    queryKey: ['sources', debouncedSearch, category, enabledFilter, sortOption.sortBy, sortOption.order, page],
    queryFn: () => fetchSources({
      search: debouncedSearch,
      category: category !== 'All' ? category : undefined,
      enabled: enabledFilter !== 'All' ? enabledFilter : undefined,
      sort_by: sortOption.sortBy,
      order: sortOption.order,
      page,
      limit,
    }),
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const sources = sourcesQuery.data?.sources || [];
  const pagination = sourcesQuery.data?.pagination || { page: 1, total_pages: 1, total: 0 };

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['sources'] });
  }

  function withMutationCallbacks(successTitle, successMessage) {
    return {
      onSuccess: () => {
        invalidate();
        showToast('success', successTitle, successMessage);
      },
      onError: (error) => {
        showToast('error', 'Action Failed', error.message);
      },
    };
  }

  const createMutation = useMutation({
    mutationFn: createSource,
    onSuccess: () => {
      invalidate();
      setFormModal({ open: false, source: null });
      showToast('success', 'Source Added', 'The new source is now part of the registry.');
    },
    onError: () => {
      createMutation.reset();
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateSource,
    onSuccess: () => {
      invalidate();
      setFormModal({ open: false, source: null });
      showToast('success', 'Source Updated', 'Changes have been saved.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSource,
    onSuccess: () => {
      invalidate();
      setDeleteModal({ open: false, source: null });
      showToast('success', 'Source Deleted', 'The source has been removed from the registry.');
    },
    onError: (error) => {
      showToast('error', 'Delete Failed', error.message);
    },
  });

  const statusMutation = useMutation({ mutationFn: updateSourceStatus, ...withMutationCallbacks('Status Changed', 'Source status updated.') });
  const healthMutation = useMutation({ mutationFn: updateSourceHealth, ...withMutationCallbacks('Health Updated', 'Health status updated.') });
  const runMutation = useMutation({ mutationFn: runSource, ...withMutationCallbacks('Run Recorded', 'Last run timestamp updated.') });
  const priorityMutation = useMutation({ mutationFn: updateSourcePriority, ...withMutationCallbacks('Priority Updated', 'Priority updated.') });

  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border border-white/70 bg-white/80 p-6 shadow-lg shadow-slate-900/5 backdrop-blur">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-blue-700">Source Registry</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">Trusted Data Sources</h2>
            <p className="mt-1 text-sm text-slate-500">Central configuration every AI agent reads instead of hardcoded URLs.</p>
          </div>
          <Button type="button" onClick={() => setFormModal({ open: true, source: null })}>
            <HiOutlinePlus className="h-4 w-4" /> Add Source
          </Button>
        </div>

        <div className="mt-6 grid w-full min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
          <SearchBar value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search by name" />
          <select className={inputClass} value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
            <option value="All">All Categories</option>
            {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className={inputClass} value={enabledFilter} onChange={(event) => { setEnabledFilter(event.target.value); setPage(1); }}>
            <option value="All">All Statuses</option>
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
          <select className={inputClass} value={sortValue} onChange={(event) => { setSortValue(event.target.value); setPage(1); }}>
            {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </section>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold uppercase text-slate-500">
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Country</th>
                <th className="px-5 py-3">Frequency</th>
                <th className="px-5 py-3">Priority</th>
                <th className="px-5 py-3">Health</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Last Run</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sourcesQuery.isLoading ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-400">Loading sources…</td></tr>
              ) : sources.length ? (
                sources.map((source) => (
                  <tr key={source.id} className="border-b border-slate-50 align-top transition hover:bg-slate-50/60">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{source.source_name}</p>
                      <a href={source.base_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">{source.base_url}</a>
                    </td>
                    <td className="px-5 py-4"><Badge tone="info">{source.category}</Badge></td>
                    <td className="px-5 py-4 text-slate-600">{source.country || '—'}</td>
                    <td className="px-5 py-4 text-slate-600">{source.crawl_frequency || '—'}</td>
                    <td className="px-5 py-4">
                      <input
                        type="number"
                        min="0"
                        defaultValue={source.priority}
                        key={`priority-${source.id}-${source.priority}`}
                        className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        onBlur={(event) => {
                          const value = Number(event.target.value);
                          if (Number.isInteger(value) && value >= 0 && value !== source.priority) {
                            priorityMutation.mutate({ id: source.id, priority: value });
                          } else {
                            event.target.value = source.priority;
                          }
                        }}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <select
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        value={source.health_status}
                        onChange={(event) => healthMutation.mutate({ id: source.id, health_status: event.target.value })}
                      >
                        {HEALTH_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <Badge tone={HEALTH_TONE[source.health_status] || 'neutral'} className="ml-2">{source.health_status}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => statusMutation.mutate({ id: source.id, enabled: !source.enabled })}
                        className={cn(
                          'inline-flex h-7 w-14 items-center rounded-full px-1 transition',
                          source.enabled ? 'justify-end bg-emerald-500' : 'justify-start bg-slate-300'
                        )}
                        aria-label={source.enabled ? 'Disable source' : 'Enable source'}
                      >
                        <span className="h-5 w-5 rounded-full bg-white shadow" />
                      </button>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{formatDateTime(source.last_run)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button type="button" title="Record run" className="rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-700" onClick={() => runMutation.mutate(source.id)}>
                          <HiOutlinePlay className="h-4 w-4" />
                        </button>
                        <button type="button" title="Edit" className="rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-700" onClick={() => setFormModal({ open: true, source })}>
                          <HiOutlinePencil className="h-4 w-4" />
                        </button>
                        <button type="button" title="Delete" className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-700" onClick={() => setDeleteModal({ open: true, source })}>
                          <HiOutlineTrash className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-5 py-10">
                    <EmptyState
                      icon={HiOutlineDatabase}
                      title="No Sources Found"
                      message="Adjust your filters or add a new trusted source to the registry."
                      actionLabel="Add Source"
                      onAction={() => setFormModal({ open: true, source: null })}
                      compact
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-slate-500">
            {pagination.total} source{pagination.total === 1 ? '' : 's'} · Page {pagination.page} of {pagination.total_pages}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
            <Button type="button" variant="secondary" disabled={page >= pagination.total_pages} onClick={() => setPage((value) => Math.min(pagination.total_pages, value + 1))}>Next</Button>
          </div>
        </div>
      </Card>

      <SourceFormModal
        open={formModal.open}
        initialValue={formModal.source}
        onClose={() => { setFormModal({ open: false, source: null }); createMutation.reset(); updateMutation.reset(); }}
        submitting={createMutation.isPending || updateMutation.isPending}
        serverError={createMutation.error?.message || updateMutation.error?.message}
        onSubmit={(payload) => {
          if (formModal.source) {
            updateMutation.mutate({ id: formModal.source.id, payload });
          } else {
            createMutation.mutate(payload);
          }
        }}
      />

      <DeleteConfirmModal
        open={deleteModal.open}
        source={deleteModal.source}
        submitting={deleteMutation.isPending}
        onClose={() => setDeleteModal({ open: false, source: null })}
        onConfirm={() => deleteMutation.mutate(deleteModal.source.id)}
      />

      <Toast alert={alert} onClose={() => setAlert(null)} />
    </div>
  );
}

export default memo(SourceRegistry);
