import { DATA_SOURCES, SECTOR_PROFILES } from '../constants/dashboard';

const SOURCE_BY_ID = new Map(DATA_SOURCES.map((source) => [source.id, source]));

export function extractCompanyFromUrl(rawUrl) {
  const url = new URL(rawUrl);
  const hostname = url.hostname.replace(/^www\./, '');
  const name = hostname
    .split('.')[0]
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  const industry = inferIndustry(`${hostname} ${url.pathname}`);

  return {
    name,
    about: `${name} appears to be a ${industry.toLowerCase()} business with digital acquisition signals.`,
    products: inferProducts(industry),
    services: inferServices(industry),
    industry,
    location: inferLocation(industry),
    contact: `contact@${hostname}`,
    website: url.toString(),
  };
}

export function analyzeUrlCompany(details) {
  const scoreByIndustry = {
    SaaS: 86,
    Fintech: 82,
    Logistics: 79,
    Healthcare: 80,
    Agriculture: 72,
  };
  const score = scoreByIndustry[details.industry] || 74;
  const needs = buildRecommendations(details.industry, details.website);

  return {
    opportunityScore: score,
    risk: score >= 84 ? 'Low' : score >= 76 ? 'Medium' : 'High',
    creditNeeds: needs,
    suggestedProducts: needs.map((need) => need.product),
  };
}

export function buildSectorResearch(sector) {
  const profile = SECTOR_PROFILES[sector];
  const sources = (profile?.sources || ['mca', 'google_news']).map((id) => SOURCE_BY_ID.get(id)).filter(Boolean);
  const signals = [
    'Latest Companies',
    'Recent News',
    'Government Schemes',
    'Recent Tenders',
    'Funding News',
    'Hiring Trends',
    'Expansion Signals',
    'Sector Growth',
  ];

  return {
    sector,
    sources,
    signals,
    generatedLeads: buildGeneratedLeads(sector, profile),
  };
}

function buildGeneratedLeads(sector, profile) {
  const leadScenarios = [
    { suffix: 'Growth Partners', tags: 'tender,government contract,working capital' },
    { suffix: 'Enterprise Labs', tags: 'expansion,project funding,capex' },
    { suffix: 'Supply Network', tags: 'large contract,receivables,cash management' },
  ];

  return leadScenarios.map((scenario, index) => ({
    name: `${sector} ${scenario.suffix}`,
    sector,
    opportunity_score: Math.min((profile?.score || 72) + index * 3, 94),
    risk_score: index === 0 ? 28 : 34 + index * 4,
    tags: `${sector.toLowerCase()},${profile?.focus?.toLowerCase() || 'growth'},${scenario.tags},ai-research`,
  }));
}

function inferIndustry(text) {
  const value = text.toLowerCase();
  if (/(saas|software|cloud|crm|tech)/.test(value)) return 'SaaS';
  if (/(fin|pay|bank|credit|wealth)/.test(value)) return 'Fintech';
  if (/(logi|ship|fleet|supply|warehouse)/.test(value)) return 'Logistics';
  if (/(health|med|care|clinic|pharma)/.test(value)) return 'Healthcare';
  if (/(agri|farm|food|crop)/.test(value)) return 'Agriculture';
  return 'SaaS';
}

function inferProducts(industry) {
  return {
    SaaS: ['Subscriptions', 'Enterprise software'],
    Fintech: ['Payments', 'Financial platform'],
    Logistics: ['Fleet services', 'Warehousing'],
    Healthcare: ['Clinical services', 'Medical operations'],
    Agriculture: ['Agri supply', 'Storage'],
  }[industry] || ['Business services'];
}

function inferServices(industry) {
  return {
    SaaS: ['Implementation', 'Support'],
    Fintech: ['Settlement', 'Compliance'],
    Logistics: ['Transportation', 'Fulfilment'],
    Healthcare: ['Diagnostics', 'Care delivery'],
    Agriculture: ['Procurement', 'Distribution'],
  }[industry] || ['Operations'];
}

function inferLocation(industry) {
  return {
    SaaS: 'Bengaluru',
    Fintech: 'Mumbai',
    Logistics: 'Pune',
    Healthcare: 'Hyderabad',
    Agriculture: 'Nashik',
  }[industry] || 'India';
}

function buildRecommendations(industry, website) {
  const base = {
    SaaS: ['Working Capital', 'Cash Credit', 'Term Loan'],
    Fintech: ['Trade Finance', 'Letter of Credit', 'Bank Guarantee'],
    Logistics: ['Equipment Finance', 'Cash Credit', 'Invoice Discounting'],
    Healthcare: ['Equipment Finance', 'Term Loan', 'Working Capital'],
    Agriculture: ['Cash Credit', 'Warehouse Finance', 'Bank Guarantee'],
  }[industry] || ['Working Capital', 'Term Loan'];

  return base.map((product, index) => ({
    product,
    reason: `${industry} signal from ${new URL(website).hostname} indicates ${product.toLowerCase()} fit.`,
    confidence: 88 - index * 7,
    risk: index === 0 ? 'Low' : 'Medium',
  }));
}

