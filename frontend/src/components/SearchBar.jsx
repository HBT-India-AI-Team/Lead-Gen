import { memo } from 'react';
import { FiSearch } from 'react-icons/fi';

function SearchBar({ value, onChange, placeholder = 'Search' }) {
  return (
    <div className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100">
      <FiSearch className="h-4 w-4 shrink-0 text-slate-400" />
      <input
        className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export default memo(SearchBar);
