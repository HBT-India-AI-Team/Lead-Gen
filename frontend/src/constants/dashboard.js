import {
  BuildingOffice2Icon,
  ChartBarIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  CurrencyRupeeIcon,
} from '@heroicons/react/24/outline';
import {
  FiDatabase,
  FiGlobe,
  FiLinkedin,
  FiTrendingUp,
} from 'react-icons/fi';
import { RiGovernmentLine } from 'react-icons/ri';

export const BACKEND_URL = window.BACKEND_URL || 'http://localhost:5000';

export const SECTORS = ['Agriculture', 'SaaS', 'Fintech', 'Logistics', 'Healthcare'];

export const DATA_SOURCES = [
  {
    id: 'mca',
    name: 'MCA',
    label: 'MCA',
    icon: RiGovernmentLine,
    type: 'Registry',
    status: 'Online',
    connection: 'Connected',
    lastUpdated: 'Today',
  },
  {
    id: 'gem',
    name: 'GeM',
    label: 'GeM',
    icon: ClipboardDocumentListIcon,
    type: 'Tenders',
    status: 'Online',
    connection: 'Connected',
    lastUpdated: '2h ago',
  },
  {
    id: 'rbi',
    name: 'RBI',
    label: 'RBI',
    icon: BuildingOffice2Icon,
    type: 'Macro',
    status: 'Online',
    connection: 'Connected',
    lastUpdated: 'Today',
  },
  {
    id: 'google_news',
    name: 'Google News',
    label: 'News',
    icon: FiGlobe,
    type: 'Signals',
    status: 'Limited',
    connection: 'Monitored',
    lastUpdated: '15m ago',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    label: 'LinkedIn',
    icon: FiLinkedin,
    type: 'Hiring',
    status: 'Limited',
    connection: 'Monitored',
    lastUpdated: '1h ago',
  },
  {
    id: 'crunchbase',
    name: 'Crunchbase',
    label: 'Funding',
    icon: CurrencyRupeeIcon,
    type: 'Funding',
    status: 'Online',
    connection: 'Connected',
    lastUpdated: '3h ago',
  },
  {
    id: 'startup_india',
    name: 'Startup India',
    label: 'Startup India',
    icon: FiDatabase,
    type: 'Registry',
    status: 'Online',
    connection: 'Connected',
    lastUpdated: 'Today',
  },
  {
    id: 'nse_bse',
    name: 'NSE/BSE',
    label: 'Markets',
    icon: ChartBarIcon,
    type: 'Markets',
    status: 'Online',
    connection: 'Connected',
    lastUpdated: 'Live',
  },
  {
    id: 'ibef',
    name: 'IBEF',
    label: 'IBEF',
    icon: FiTrendingUp,
    type: 'Sector',
    status: 'Online',
    connection: 'Connected',
    lastUpdated: 'Today',
  },
  {
    id: 'cppp',
    name: 'CPPP',
    label: 'CPPP',
    icon: ClipboardDocumentListIcon,
    type: 'Tenders',
    status: 'Online',
    connection: 'Connected',
    lastUpdated: '45m ago',
  },
];

export const SECTOR_PROFILES = {
  Agriculture: {
    score: 72,
    risk: 'Medium',
    focus: 'Warehouse finance',
    sources: ['gem', 'cppp', 'ibef', 'rbi'],
    signals: ['Recent tenders', 'Cold storage demand', 'Equipment purchase', 'GST growth'],
  },
  SaaS: {
    score: 86,
    risk: 'Low',
    focus: 'Cash management',
    sources: ['mca', 'linkedin', 'crunchbase', 'google_news'],
    signals: ['Hiring', 'Funding', 'Digital transformation', 'Expansion signals'],
  },
  Fintech: {
    score: 82,
    risk: 'Medium',
    focus: 'Trade finance',
    sources: ['rbi', 'mca', 'nse_bse', 'google_news'],
    signals: ['Regulatory updates', 'Large contracts', 'Funding news', 'Import export'],
  },
  Logistics: {
    score: 78,
    risk: 'High',
    focus: 'Fleet expansion',
    sources: ['gem', 'cppp', 'linkedin', 'ibef'],
    signals: ['Fleet expansion', 'Warehouse', 'Tender wins', 'CAPEX'],
  },
  Healthcare: {
    score: 80,
    risk: 'Low',
    focus: 'Equipment finance',
    sources: ['mca', 'gem', 'google_news', 'ibef'],
    signals: ['Machinery purchase', 'New branch', 'Hiring', 'Large contracts'],
  },
};

export const KPI_CONFIG = [
  { key: 'total', label: 'Companies', subtitle: 'Lead queue', trend: '+12%', icon: BuildingOffice2Icon },
  { key: 'averageScore', label: 'Avg Score', subtitle: 'Opportunity', trend: '+4 pts', icon: ChartBarIcon },
  { key: 'creditNeeds', label: 'Credit Needs', subtitle: 'Detected', trend: '+18%', icon: CurrencyRupeeIcon },
  { key: 'pending', label: 'Pending Research', subtitle: 'Open items', trend: '-6%', icon: ClipboardDocumentListIcon },
  { key: 'approved', label: 'Approved', subtitle: 'Proposals', trend: '+9%', icon: CheckCircleIcon },
];
