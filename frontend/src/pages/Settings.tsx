import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Cpu,
  Database,
  KeyRound,
  ListChecks,
  Loader2,
  Pencil,
  RefreshCw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  User,
  Wifi,
  X,
  XCircle,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import StatusBadge from '../components/ui/StatusBadge';
import LeadCategorySettings from '../components/settings/LeadCategorySettings';
import type { StatusTone } from '../components/ui/StatusBadge';
import { updateProfile as updateProfileRequest, changePassword as changePasswordRequest } from '../services/userApi';
import { fetchTenders } from '../services/tendersApi';
import { BACKEND_URL } from '../constants/dashboard';
import { formatDate } from '../utils/tenderFormatters';
import { cn } from '../utils/formatters';
import {
  THEME_OPTIONS,
  LANDING_PAGE_OPTIONS,
  DEFAULT_LEAD_VIEW_OPTIONS,
  ITEMS_PER_PAGE_OPTIONS,
  LEAD_CATEGORY_OPTIONS,
  LEAD_STATUS_OPTIONS,
  LEAD_SOURCE_OPTIONS,
  NOTIFICATION_TOGGLES,
  readPreferences,
  writePreferences,
  readLeadDefaults,
  writeLeadDefaults,
  readLocalDepartment,
  writeLocalDepartment,
} from '../constants/settingsPreferences';
import type {
  Preferences,
  ThemeOption,
  LandingPageOption,
  DefaultLeadViewOption,
  ItemsPerPageOption,
  LeadDefaults,
  LeadCategoryOption,
  LeadStatusOption,
  LeadSourceOption,
} from '../constants/settingsPreferences';
import { LEAD_CATEGORY_TABS, isWipCategory } from '../constants/leadCategorySettings';

// Settings' own top-level tab bar: "General" (account/system settings, this
// page's previous flat stack of cards) plus one tab per real lead category
// (Tender + the WIP placeholders) — a single unified tablist rather than
// General living as an untabbed stack above a separately-tabbed Lead
// Management section.
type SettingsTab = 'General' | LeadCategoryOption;
const SETTINGS_TABS: SettingsTab[] = ['General', ...LEAD_CATEGORY_TABS];

// There is no login flow — every session acts as this fixed system account
// (matches the seeded admin row, src/db/seed.js DEFAULT_ADMIN / SYSTEM_USER
// in src/middleware/systemUser.js). Profile edits still hit the real
// PUT /api/users/profile endpoint; they just always target that one row.
const DEFAULT_PROFILE = {
  firstName: 'System',
  lastName: 'Administrator',
  email: 'admin@sbi.com',
  phone: '',
  role: 'Admin',
};

interface DataSyncTender {
  created_at: string | null;
}
interface DataSyncResponse {
  tenders: DataSyncTender[];
  pagination: { total: number };
  stats: { enriched: number };
}

const MUTED_VALUES = new Set(['Unavailable', 'Awaiting backend integration', 'Not set', 'Not set (local preference)']);

const selectClass =
  'h-10 w-full rounded-lg border border-hairline-strong bg-surface px-3 text-sm text-ink outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/10';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`tabular mt-1 text-sm font-medium ${MUTED_VALUES.has(value) ? 'text-ink-muted' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

function StatusRow({ label, tone, text }: { label: string; tone: StatusTone; text: string }) {
  return (
    <div className="flex items-center justify-between border-b border-hairline py-3 last:border-0">
      <p className="text-sm font-medium text-ink-soft">{label}</p>
      <StatusBadge tone={tone}>{text}</StatusBadge>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary">
        <Icon className="h-4 w-4" strokeWidth={2} />
      </div>
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      </div>
    </div>
  );
}

// ---- Snackbar notifications (section 9) — this page's own toast stack.
// No shared Toast component exists in the current TS component set
// (components/ui/Toast.jsx is a different, legacy-era design system used
// only by SourceRegistry.jsx — see FRONTEND_ARCHITECTURE.md), so this is a
// small, page-local stack rather than reusing an incompatible component.

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

let toastSequence = 0;

function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  function pushToast(tone: ToastTone, message: string) {
    const id = ++toastSequence;
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4000);
  }

  function dismissToast(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  return { toasts, pushToast, dismissToast };
}

const TOAST_TONE_CLASSES: Record<ToastTone, string> = {
  success: 'border-success-border bg-success-bg text-success',
  error: 'border-danger-border bg-danger-bg text-danger',
  info: 'border-info-border bg-info-bg text-secondary',
};

function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 grid gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold shadow-lg ${TOAST_TONE_CLASSES[toast.tone]}`}
        >
          {toast.tone === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} />
          ) : toast.tone === 'error' ? (
            <XCircle className="h-4 w-4 shrink-0" strokeWidth={2} />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} />
          )}
          <span>{toast.message}</span>
          <button type="button" onClick={() => onDismiss(toast.id)} className="ml-2 text-current opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Settings() {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const { toasts, pushToast, dismissToast } = useToasts();
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('General');

  const roleName = profile.role;
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

  // ---- Shared real-data queries (Data & Synchronization, AI Configuration, System Information) ----

  const dataSyncQuery = useQuery({
    queryKey: ['settings-data-sync'],
    queryFn: () => fetchTenders({ sort_by: 'created_at', order: 'desc', limit: 1, page: 1 }) as Promise<DataSyncResponse>,
  });

  // The only real, checkable signal anywhere in this app: the backend's own
  // unauthenticated root route (same pattern Dashboard.tsx already uses).
  // There is no separate MySQL or Ollama health endpoint to reuse — both
  // are reported as unavailable below rather than inferred from this.
  const apiHealthQuery = useQuery({
    queryKey: ['settings-api-health'],
    queryFn: async () => {
      const response = await fetch(`${BACKEND_URL}/`);
      if (!response.ok) throw new Error('API unreachable');
      return response.json() as Promise<{ status: string }>;
    },
    retry: 0,
  });

  const latestTenderCreatedAt = dataSyncQuery.data?.tenders[0]?.created_at;
  const lastSyncDisplay = dataSyncQuery.isLoading
    ? '…'
    : dataSyncQuery.isError || !latestTenderCreatedAt
      ? 'Unavailable'
      : formatDate(latestTenderCreatedAt.slice(0, 10));

  function handleSyncStatus() {
    const connectionText = apiHealthQuery.isError ? 'offline' : 'online';
    pushToast('info', `Backend is ${connectionText}. Last real sync: ${lastSyncDisplay}.`);
  }

  // ==================================================================
  // 1. Profile Settings
  // ==================================================================

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', phone: '', department: '' });
  const [profileErrors, setProfileErrors] = useState<{ firstName?: string; lastName?: string; phone?: string }>({});
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [localDepartment, setLocalDepartment] = useState(() => readLocalDepartment());

  function startEditingProfile() {
    setProfileForm({
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      department: localDepartment,
    });
    setProfileErrors({});
    setIsEditingProfile(true);
  }

  function cancelEditingProfile() {
    setIsEditingProfile(false);
    setProfileErrors({});
  }

  function validateProfileForm() {
    const errors: typeof profileErrors = {};
    if (!profileForm.firstName.trim()) errors.firstName = 'First name is required.';
    if (!profileForm.lastName.trim()) errors.lastName = 'Last name is required.';
    if (profileForm.phone.trim() && !/^[+]?[\d\s-]{7,15}$/.test(profileForm.phone.trim())) {
      errors.phone = 'Enter a valid phone number.';
    }
    setProfileErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function saveProfile() {
    if (!validateProfileForm()) return;
    setIsSavingProfile(true);
    try {
      await updateProfileRequest({
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        phone: profileForm.phone.trim(),
      });
      writeLocalDepartment(profileForm.department.trim());
      setLocalDepartment(profileForm.department.trim());
      setProfile((current) => ({
        ...current,
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        phone: profileForm.phone.trim(),
      }));
      setIsEditingProfile(false);
      pushToast('success', 'Settings saved successfully');
    } catch (error) {
      pushToast('error', error instanceof Error ? `Unable to save settings: ${error.message}` : 'Unable to save settings');
    } finally {
      setIsSavingProfile(false);
    }
  }

  // ==================================================================
  // 2. Application Preferences (localStorage only — no backend preferences API)
  // ==================================================================

  const [preferences, setPreferences] = useState<Preferences>(() => readPreferences());
  const [preferencesDraft, setPreferencesDraft] = useState<Preferences>(preferences);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const preferencesDirty = JSON.stringify(preferences) !== JSON.stringify(preferencesDraft);

  function savePreferences() {
    setIsSavingPreferences(true);
    try {
      writePreferences(preferencesDraft);
      setPreferences(preferencesDraft);
      pushToast('success', 'Preferences updated');
    } catch {
      pushToast('error', 'Unable to save settings');
    } finally {
      setIsSavingPreferences(false);
    }
  }

  function cancelPreferences() {
    setPreferencesDraft(preferences);
  }

  // ==================================================================
  // 3. Lead Management Settings (localStorage only)
  // ==================================================================

  const [leadDefaults, setLeadDefaults] = useState<LeadDefaults>(() => readLeadDefaults());
  const [leadDefaultsDraft, setLeadDefaultsDraft] = useState<LeadDefaults>(leadDefaults);
  const [isSavingLeadDefaults, setIsSavingLeadDefaults] = useState(false);
  const leadDefaultsDirty = JSON.stringify(leadDefaults) !== JSON.stringify(leadDefaultsDraft);

  function saveLeadDefaults() {
    setIsSavingLeadDefaults(true);
    try {
      writeLeadDefaults(leadDefaultsDraft);
      setLeadDefaults(leadDefaultsDraft);
      pushToast('success', 'Preferences updated');
    } catch {
      pushToast('error', 'Unable to save settings');
    } finally {
      setIsSavingLeadDefaults(false);
    }
  }

  function cancelLeadDefaults() {
    setLeadDefaultsDraft(leadDefaults);
  }

  // ==================================================================
  // 7. Security — Change Password (PUT /api/users/change-password, real) + Sign Out
  // ==================================================================

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordErrors, setPasswordErrors] = useState<{ currentPassword?: string; newPassword?: string; confirmPassword?: string }>({});
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  function resetPasswordForm() {
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordErrors({});
  }

  function validatePasswordForm() {
    const errors: typeof passwordErrors = {};
    if (!passwordForm.currentPassword) errors.currentPassword = 'Current password is required.';
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(passwordForm.newPassword)) {
      errors.newPassword = 'New password must be at least 8 characters and include a letter and a number.';
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    setPasswordErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitPasswordChange() {
    if (!validatePasswordForm()) return;
    setIsSavingPassword(true);
    try {
      await changePasswordRequest({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword });
      pushToast('success', 'Password changed successfully.');
      resetPasswordForm();
      setIsChangingPassword(false);
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Unable to save settings');
    } finally {
      setIsSavingPassword(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-ink">Settings</h2>
        <p className="mt-1 text-sm text-ink-soft">Configure your profile, preferences, integrations, and account security.</p>
      </div>

      {/* Master tab bar — General (account/system settings) plus one tab per
          real lead category. Same pill + WIP-badge visual pattern the old
          per-feature Lead Management tab bar used, now promoted to the page
          level since General needed to sit alongside it as an equal tab
          rather than an untabbed stack above it. */}
      <div role="tablist" aria-label="Settings sections" className="flex flex-wrap gap-1.5 border-b border-hairline pb-3">
        {SETTINGS_TABS.map((tab) => {
          const isActive = tab === activeSettingsTab;
          const tabWip = tab !== 'General' && isWipCategory(tab);
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveSettingsTab(tab)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                isActive ? 'bg-primary text-white' : 'text-ink-soft hover:bg-surface-sunken'
              )}
            >
              {tab}
              {tabWip && (
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                    isActive ? 'bg-white/25 text-white' : 'bg-warning-bg text-warning'
                  )}
                >
                  WIP
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeSettingsTab !== 'General' ? (
        <LeadCategorySettings category={activeSettingsTab} pushToast={pushToast} />
      ) : (
      <>
      {/* 1. Profile Settings */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <SectionHeader icon={User} title="Profile Settings" />
          {!isEditingProfile && (
            <Button type="button" variant="secondary" onClick={startEditingProfile}>
              <Pencil className="h-3.5 w-3.5" strokeWidth={2} /> Edit Profile
            </Button>
          )}
        </div>

        {!isEditingProfile ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Full Name" value={fullName} />
            <Field label="Email" value={profile.email} />
            <Field label="Role" value={roleName} />
            <Field label="Phone Number" value={profile.phone || 'Not set'} />
            <Field label="Department" value={localDepartment || 'Not set (local preference)'} />
          </div>
        ) : (
          <div className="mt-4 grid gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="First Name"
                value={profileForm.firstName}
                onChange={(event) => setProfileForm((form) => ({ ...form, firstName: event.target.value }))}
                error={profileErrors.firstName}
              />
              <Input
                label="Last Name"
                value={profileForm.lastName}
                onChange={(event) => setProfileForm((form) => ({ ...form, lastName: event.target.value }))}
                error={profileErrors.lastName}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Email" value={profile.email} disabled className="cursor-not-allowed opacity-60" />
              <Input
                label="Phone Number"
                value={profileForm.phone}
                onChange={(event) => setProfileForm((form) => ({ ...form, phone: event.target.value }))}
                error={profileErrors.phone}
                placeholder="e.g. +91 98765 43210"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Role" value={roleName ?? ''} disabled className="cursor-not-allowed opacity-60" />
              <Input
                label="Department"
                value={profileForm.department}
                onChange={(event) => setProfileForm((form) => ({ ...form, department: event.target.value }))}
                placeholder="e.g. Relationship Banking"
              />
            </div>
            <p className="text-xs text-ink-muted">
              Email and Role are managed by an administrator and can&apos;t be edited here — the backend rejects any email change
              outright. Department has no backend field yet, so it&apos;s saved locally in this browser only.
            </p>
            <div className="flex items-center gap-3">
              <Button type="button" variant="primary" onClick={saveProfile} disabled={isSavingProfile}>
                {isSavingProfile && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
                {isSavingProfile ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button type="button" variant="secondary" onClick={cancelEditingProfile} disabled={isSavingProfile}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 2. Application Preferences */}
      <Card className="p-5">
        <SectionHeader
          icon={SlidersHorizontal}
          title="Application Preferences"
          description="Saved to this browser only — there is no backend preferences API yet."
        />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Theme</label>
            <select
              className={selectClass}
              value={preferencesDraft.theme}
              onChange={(event) => setPreferencesDraft((prefs) => ({ ...prefs, theme: event.target.value as ThemeOption }))}
            >
              {THEME_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Default Landing Page</label>
            <select
              className={selectClass}
              value={preferencesDraft.landingPage}
              onChange={(event) => setPreferencesDraft((prefs) => ({ ...prefs, landingPage: event.target.value as LandingPageOption }))}
            >
              {LANDING_PAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.value}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Default Lead View</label>
            <select
              className={selectClass}
              value={preferencesDraft.defaultLeadView}
              onChange={(event) =>
                setPreferencesDraft((prefs) => ({ ...prefs, defaultLeadView: event.target.value as DefaultLeadViewOption }))
              }
            >
              {DEFAULT_LEAD_VIEW_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Items Per Page</label>
            <select
              className={selectClass}
              value={preferencesDraft.itemsPerPage}
              onChange={(event) =>
                setPreferencesDraft((prefs) => ({ ...prefs, itemsPerPage: Number(event.target.value) as ItemsPerPageOption }))
              }
            >
              {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Default Landing Page takes effect immediately on your next visit to &quot;/&quot;. Default Lead View and Items Per Page are
          saved as your preference now — the Leads page doesn&apos;t read them yet.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button type="button" variant="primary" onClick={savePreferences} disabled={!preferencesDirty || isSavingPreferences}>
            {isSavingPreferences ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button type="button" variant="secondary" onClick={cancelPreferences} disabled={!preferencesDirty}>
            Cancel
          </Button>
        </div>
      </Card>

      {/* 3a. Lead Defaults (flat dropdowns — default values applied to new leads) */}
      <Card className="p-5">
        <SectionHeader
          icon={ListChecks}
          title="Lead Defaults"
          description="Default category/status/source for new leads. Matches the terminology used on the Leads page. Saved locally — the Leads page doesn't read these defaults yet."
        />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Default Lead Category</label>
            <select
              className={selectClass}
              value={leadDefaultsDraft.defaultLeadCategory}
              onChange={(event) =>
                setLeadDefaultsDraft((defaults) => ({ ...defaults, defaultLeadCategory: event.target.value as LeadCategoryOption }))
              }
            >
              {LEAD_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Default Lead Status</label>
            <select
              className={selectClass}
              value={leadDefaultsDraft.defaultLeadStatus}
              onChange={(event) =>
                setLeadDefaultsDraft((defaults) => ({ ...defaults, defaultLeadStatus: event.target.value as LeadStatusOption }))
              }
            >
              {LEAD_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Default Lead Source</label>
            <select
              className={selectClass}
              value={leadDefaultsDraft.defaultLeadSource}
              onChange={(event) =>
                setLeadDefaultsDraft((defaults) => ({ ...defaults, defaultLeadSource: event.target.value as LeadSourceOption }))
              }
            >
              {LEAD_SOURCE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button type="button" variant="primary" onClick={saveLeadDefaults} disabled={!leadDefaultsDirty || isSavingLeadDefaults}>
            {isSavingLeadDefaults ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button type="button" variant="secondary" onClick={cancelLeadDefaults} disabled={!leadDefaultsDirty}>
            Cancel
          </Button>
        </div>
      </Card>

      {/* 4. Notification Settings */}
      <Card className="p-5">
        <SectionHeader icon={Bell} title="Notification Settings" />
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Email alerts ({NOTIFICATION_TOGGLES.map((toggle) => toggle.label.toLowerCase()).join(', ')}) aren&apos;t wired to a
          backend yet — no email or notification backend exists, so there&apos;s nothing real here to toggle.
        </p>
      </Card>

      {/* 5. Data & Synchronization */}
      <Card className="p-5">
        <SectionHeader icon={Database} title="Data & Synchronization" />
        <div className="mt-3">
          <StatusRow label="Data Source" tone="neutral" text="TenderBook" />
          <StatusRow label="Database" tone="neutral" text="MySQL" />
          <StatusRow
            label="Connection Status"
            tone={apiHealthQuery.isLoading ? 'neutral' : apiHealthQuery.isError ? 'danger' : 'success'}
            text={apiHealthQuery.isLoading ? 'Checking…' : apiHealthQuery.isError ? 'Unavailable' : 'Connected'}
          />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Last Sync" value={lastSyncDisplay} />
          <Field
            label="Total Tenders"
            value={dataSyncQuery.isLoading ? '…' : dataSyncQuery.isError ? 'Unavailable' : (dataSyncQuery.data?.pagination.total ?? 0).toLocaleString('en-IN')}
          />
          <Field
            label="Winning Companies Identified"
            value={dataSyncQuery.isLoading ? '…' : dataSyncQuery.isError ? 'Unavailable' : (dataSyncQuery.data?.stats.enriched ?? 0).toLocaleString('en-IN')}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={() => dataSyncQuery.refetch()} disabled={dataSyncQuery.isFetching}>
            <RefreshCw className={`h-4 w-4 ${dataSyncQuery.isFetching ? 'animate-spin' : ''}`} strokeWidth={2} /> Refresh Data
          </Button>
          <Button type="button" variant="secondary" onClick={() => apiHealthQuery.refetch()} disabled={apiHealthQuery.isFetching}>
            <Wifi className="h-4 w-4" strokeWidth={2} /> Check Connection
          </Button>
          <Button type="button" variant="secondary" onClick={handleSyncStatus}>
            <RefreshCw className="h-4 w-4" strokeWidth={2} /> Sync Status
          </Button>
        </div>
      </Card>

      {/* 6. AI Configuration */}
      <Card className="p-5">
        <SectionHeader icon={Cpu} title="AI Configuration" />
        <div className="mt-3">
          <StatusRow label="AI Provider" tone="neutral" text="Ollama" />
          <StatusRow label="Connection" tone="neutral" text="Unavailable" />
          <StatusRow label="Model" tone="neutral" text="Awaiting backend integration" />
          <StatusRow label="AI Analysis" tone="success" text="Enabled" />
          <StatusRow label="Expert Review" tone="success" text="Enabled" />
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Ollama runs entirely server-side (configured via OLLAMA_BASE_URL/OLLAMA_DEFAULT_MODEL) with no health or config endpoint
          exposed to the frontend, so live connection status and the active model can&apos;t be verified from here — shown honestly as
          unavailable rather than guessed. AI Analysis and Expert Review describe this deployment&apos;s built-in workflow
          (POST /api/lead-analysis, plus the manual review step before a proposal is approved), not a live connection check.
        </p>
      </Card>

      {/* 7. Security */}
      <Card className="p-5">
        <SectionHeader icon={ShieldCheck} title="Security" />
        <div className="mt-3">
          <StatusRow label="Current Role" tone="neutral" text={roleName} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={() => setIsChangingPassword((value) => !value)}>
            <KeyRound className="h-4 w-4" strokeWidth={2} /> Change Password
          </Button>
        </div>

        {isChangingPassword && (
          <div className="mt-4 grid gap-4 border-t border-hairline pt-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                type="password"
                label="Current Password"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((form) => ({ ...form, currentPassword: event.target.value }))}
                error={passwordErrors.currentPassword}
              />
              <Input
                type="password"
                label="New Password"
                value={passwordForm.newPassword}
                onChange={(event) => setPasswordForm((form) => ({ ...form, newPassword: event.target.value }))}
                error={passwordErrors.newPassword}
              />
              <Input
                type="password"
                label="Confirm New Password"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((form) => ({ ...form, confirmPassword: event.target.value }))}
                error={passwordErrors.confirmPassword}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="button" variant="primary" onClick={submitPasswordChange} disabled={isSavingPassword}>
                {isSavingPassword ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsChangingPassword(false);
                  resetPasswordForm();
                }}
                disabled={isSavingPassword}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 8. System Information */}
      <Card className="p-5">
        <SectionHeader icon={Server} title="System Information" />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Application" value="LeadGen AI Command Center" />
          <Field label="Frontend" value="React + TypeScript" />
          <Field label="Backend" value="Node.js + Express" />
          <Field label="Database" value="MySQL" />
          <Field label="Environment" value={import.meta.env.MODE} />
        </div>
        <div className="mt-3">
          <StatusRow
            label="API Status"
            tone={apiHealthQuery.isLoading ? 'neutral' : apiHealthQuery.isError ? 'danger' : 'success'}
            text={apiHealthQuery.isLoading ? 'Checking…' : apiHealthQuery.isError ? 'Unavailable' : 'Connected'}
          />
        </div>
      </Card>
      </>
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default Settings;
