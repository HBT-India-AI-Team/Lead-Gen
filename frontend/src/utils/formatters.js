export function formatDateTime(value) {
  if (!value) return 'Now';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return 'Now';
  }
}

export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function riskTone(level = 'Low') {
  const normalized = String(level).toLowerCase();
  if (normalized.includes('high')) return 'danger';
  if (normalized.includes('medium')) return 'warning';
  return 'success';
}

export function clampScore(score = 0) {
  return Math.max(0, Math.min(Number(score) || 0, 100));
}
