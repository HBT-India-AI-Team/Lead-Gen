import { memo, useState } from 'react';
import { GlobeAltIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

function UrlResearchForm({ disabled, onSubmit }) {
  const [url, setUrl] = useState('');

  return (
    <form
      className="w-full min-w-0 max-w-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (!url.trim()) return;
        onSubmit(url.trim());
      }}
    >
      <label className="sr-only" htmlFor="research-url">
        URL Research
      </label>
      <div className="flex items-center rounded-xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100">
        <GlobeAltIcon className="ml-2 h-4 w-4 text-slate-400 flex-shrink-0" />
        <input
          id="research-url"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://company.in"
          className="min-w-0 flex-1 bg-transparent px-2 text-xs text-slate-800 outline-none placeholder:text-slate-400"
          disabled={disabled}
          required
        />
        <button
          type="submit"
          disabled={disabled || !url.trim()}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-blue-700 px-4 text-xs font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-blue-800 disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0"
        >
          <MagnifyingGlassIcon className="h-3.5 w-3.5" />
          <span>Research</span>
        </button>
      </div>
    </form>
  );
}

export default memo(UrlResearchForm);
