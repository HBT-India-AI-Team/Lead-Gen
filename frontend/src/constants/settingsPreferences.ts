// Frontend-only Settings preferences. There is no backend preferences API
// (confirmed: no /api/settings or /api/preferences route exists anywhere in
// src/routes) — every value here is persisted to localStorage only, per the
// Settings page spec's explicit fallback rule. Kept in its own file (rather
// than inline in Settings.tsx) because AppRouter.tsx also needs to read
// `landingPage` for the "Default Landing Page" redirect, and duplicating the
// storage key/shape in two files would drift.

export const PREFERENCES_STORAGE_KEY = 'leadgen.settings.preferences.v1';
export const LEAD_DEFAULTS_STORAGE_KEY = 'leadgen.settings.leadDefaults.v1';
export const NOTIFICATIONS_STORAGE_KEY = 'leadgen.settings.notifications.v1';
export const PROFILE_LOCAL_STORAGE_KEY = 'leadgen.settings.profileLocal.v1';

export const THEME_OPTIONS = ['Light', 'Dark', 'System Default'] as const;
export type ThemeOption = (typeof THEME_OPTIONS)[number];

// value = what the dropdown shows; path = the real route NAV_ITEMS already
// registers for it (Sidebar.tsx) — reused here instead of re-declaring paths.
export const LANDING_PAGE_OPTIONS = [
  { value: 'Dashboard', path: '/dashboard' },
  { value: 'Leads', path: '/tender-leads' },
  { value: 'Analytics', path: '/analytics' },
] as const;
export type LandingPageOption = (typeof LANDING_PAGE_OPTIONS)[number]['value'];

export const DEFAULT_LEAD_VIEW_OPTIONS = ['All Leads', 'Hot Leads', 'Winning Companies', 'Awaiting Review'] as const;
export type DefaultLeadViewOption = (typeof DEFAULT_LEAD_VIEW_OPTIONS)[number];

export const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;
export type ItemsPerPageOption = (typeof ITEMS_PER_PAGE_OPTIONS)[number];

export interface Preferences {
  theme: ThemeOption;
  landingPage: LandingPageOption;
  defaultLeadView: DefaultLeadViewOption;
  itemsPerPage: ItemsPerPageOption;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'System Default',
  landingPage: 'Dashboard',
  defaultLeadView: 'All Leads',
  itemsPerPage: 10,
};

// Matches the exact wording already used by the real Leads page's Lead
// Category dropdown (TenderLeads.tsx's LEAD_CATEGORY_OPTIONS) minus "All
// Lead Categories" (not a meaningful *default*), so a saved default lines up
// with what that page's filter actually offers. "Government tenders
// (bid/win)" was removed — it duplicated "Tender" (both cover the same real
// tender-award data), so keeping both as separate selectable categories was
// itself the bug, not just a UI label issue.
export const LEAD_CATEGORY_OPTIONS = [
  'Tender',
  'New company registration',
  'GST registration',
  'Company expansion (hiring)',
  'Government scheme approvals',
] as const;
export type LeadCategoryOption = (typeof LEAD_CATEGORY_OPTIONS)[number];

export const LEAD_STATUS_OPTIONS = [
  'New',
  'Awaiting Health Check',
  'Awaiting Proposal',
  'Proposal Sent',
  'Review Waiting List',
  'Won',
  'Lost',
] as const;
export type LeadStatusOption = (typeof LEAD_STATUS_OPTIONS)[number];

export const LEAD_SOURCE_OPTIONS = ['TenderBook', 'Manual', 'Research', 'Other'] as const;
export type LeadSourceOption = (typeof LEAD_SOURCE_OPTIONS)[number];

export interface LeadDefaults {
  defaultLeadCategory: LeadCategoryOption;
  defaultLeadStatus: LeadStatusOption;
  defaultLeadSource: LeadSourceOption;
}

export const DEFAULT_LEAD_DEFAULTS: LeadDefaults = {
  defaultLeadCategory: 'Tender',
  defaultLeadStatus: 'New',
  defaultLeadSource: 'TenderBook',
};

export const NOTIFICATION_TOGGLES = [
  { key: 'emailNotifications', label: 'Email Notifications' },
  { key: 'leadHealthCheckCompleted', label: 'Lead Health Check Completed' },
  { key: 'newWinningCompanyIdentified', label: 'New Winning Company Identified' },
  { key: 'proposalStatusUpdates', label: 'Proposal Status Updates' },
  { key: 'humanReviewRequired', label: 'Human Review Required' },
  { key: 'systemSyncErrors', label: 'System / Sync Errors' },
  { key: 'dailyLeadSummary', label: 'Daily Lead Summary' },
] as const;

export type NotificationKey = (typeof NOTIFICATION_TOGGLES)[number]['key'];
export type NotificationPreferences = Record<NotificationKey, boolean>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = NOTIFICATION_TOGGLES.reduce(
  (acc, toggle) => ({ ...acc, [toggle.key]: true }),
  {} as NotificationPreferences
);

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function readPreferences(): Preferences {
  return readJson(PREFERENCES_STORAGE_KEY, DEFAULT_PREFERENCES);
}
export function writePreferences(value: Preferences): void {
  writeJson(PREFERENCES_STORAGE_KEY, value);
}

export function readLeadDefaults(): LeadDefaults {
  return readJson(LEAD_DEFAULTS_STORAGE_KEY, DEFAULT_LEAD_DEFAULTS);
}
export function writeLeadDefaults(value: LeadDefaults): void {
  writeJson(LEAD_DEFAULTS_STORAGE_KEY, value);
}

export function readNotificationPreferences(): NotificationPreferences {
  return readJson(NOTIFICATIONS_STORAGE_KEY, DEFAULT_NOTIFICATION_PREFERENCES);
}
export function writeNotificationPreferences(value: NotificationPreferences): void {
  writeJson(NOTIFICATIONS_STORAGE_KEY, value);
}

export function readLocalDepartment(): string {
  try {
    return localStorage.getItem(PROFILE_LOCAL_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}
export function writeLocalDepartment(value: string): void {
  localStorage.setItem(PROFILE_LOCAL_STORAGE_KEY, value);
}

/** Resolves the real route for the saved "Default Landing Page" preference — used by AppRouter.tsx's index redirect. Falls back to '/dashboard' (today's hardcoded behavior) if nothing is saved yet or localStorage is unavailable. */
export function readLandingPagePath(): string {
  try {
    const preferences = readPreferences();
    const match = LANDING_PAGE_OPTIONS.find((option) => option.value === preferences.landingPage);
    return match?.path ?? '/dashboard';
  } catch {
    return '/dashboard';
  }
}
