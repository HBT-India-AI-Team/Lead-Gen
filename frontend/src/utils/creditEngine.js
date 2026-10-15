const SIGNAL_RULES = [
  {
    id: 'new_branch',
    patterns: ['new branch', 'office opening', 'facility expansion', 'geographic expansion'],
    product: 'Term Loan',
    reason: 'Expansion signal suggests medium-term capital requirement.',
    confidence: 82,
    risk: 'Low',
  },
  {
    id: 'factory_expansion',
    patterns: ['factory expansion', 'manufacturing unit', 'plant capacity', 'capex'],
    product: 'Term Loan',
    reason: 'CAPEX and production capacity growth usually need structured repayment.',
    confidence: 86,
    risk: 'Medium',
  },
  {
    id: 'hiring',
    patterns: ['hiring', 'jobs', 'recruitment', 'team expansion', 'payroll'],
    product: 'Working Capital',
    reason: 'Hiring momentum can increase payroll and operating cash needs.',
    confidence: 74,
    risk: 'Low',
  },
  {
    id: 'machinery',
    patterns: ['machinery', 'equipment', 'automation', 'medical equipment'],
    product: 'Equipment Finance',
    reason: 'Asset purchase signal maps to equipment-backed financing.',
    confidence: 88,
    risk: 'Medium',
  },
  {
    id: 'import_export',
    patterns: ['import', 'export', 'cross-border', 'foreign buyer', 'global'],
    product: 'Trade Finance',
    reason: 'Cross-border activity can require LC, forex and shipment finance.',
    confidence: 84,
    risk: 'Low',
  },
  {
    id: 'fleet',
    patterns: ['fleet', 'vehicles', 'delivery network', 'transport capacity'],
    product: 'Equipment Finance',
    reason: 'Fleet expansion is an asset finance opportunity.',
    confidence: 83,
    risk: 'Medium',
  },
  {
    id: 'warehouse',
    patterns: ['warehouse', 'cold storage', 'inventory', 'fulfilment'],
    product: 'Cash Credit',
    reason: 'Inventory-heavy operations can benefit from cash credit limits.',
    confidence: 81,
    risk: 'Medium',
  },
  {
    id: 'funding',
    patterns: ['funding', 'series', 'raised', 'investment', 'venture'],
    product: 'Working Capital',
    reason: 'Fresh funding often precedes growth spending and banking migration.',
    confidence: 76,
    risk: 'Low',
  },
  {
    id: 'tender',
    patterns: ['tender', 'procurement', 'government contract', 'gem', 'cppp'],
    product: 'Bank Guarantee',
    reason: 'Tender wins commonly require guarantees and performance security.',
    confidence: 89,
    risk: 'Low',
  },
  {
    id: 'large_contract',
    patterns: ['large contract', 'enterprise deal', 'purchase order', 'supply agreement'],
    product: 'Invoice Discounting',
    reason: 'Large receivables can be monetized through invoice discounting.',
    confidence: 80,
    risk: 'Medium',
  },
  {
    id: 'gst_growth',
    patterns: ['gst growth', 'revenue growth', 'sales growth', 'turnover'],
    product: 'Cash Credit',
    reason: 'Revenue growth can support higher working capital limits.',
    confidence: 78,
    risk: 'Low',
  },
  {
    id: 'digital',
    patterns: ['digital transformation', 'cloud', 'saas', 'automation', 'cybersecurity'],
    product: 'Term Loan',
    reason: 'Technology upgrades can be financed as modernization CAPEX.',
    confidence: 73,
    risk: 'Low',
  },
];

export function identifyCreditNeeds(company = {}) {
  const text = [
    company.name,
    company.sector,
    company.focus_area,
    company.data_source_url,
    ...(company.tags || []),
    ...(company.predictive_needs || []).map((need) => `${need.service_name} ${need.trigger_signal}`),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const matches = SIGNAL_RULES.filter((rule) =>
    rule.patterns.some((pattern) => text.includes(pattern))
  );

  const fallbackBySector = {
    SaaS: ['digital', 'hiring'],
    Fintech: ['import_export', 'digital'],
    Logistics: ['fleet', 'warehouse'],
    Healthcare: ['machinery', 'new_branch'],
    Agriculture: ['warehouse', 'tender'],
  };

  const fallback = (fallbackBySector[company.sector] || ['gst_growth'])
    .map((id) => SIGNAL_RULES.find((rule) => rule.id === id))
    .filter(Boolean);

  return [...new Map([...matches, ...fallback].map((item) => [item.product, item])).values()]
    .slice(0, 3);
}

export function enrichCompany(company) {
  const creditRecommendations = identifyCreditNeeds(company);
  const firstNeed = company.predictive_needs?.[0]?.service_name || creditRecommendations[0]?.product || 'Working Capital';

  return {
    ...company,
    creditRecommendations,
    primaryCreditNeed: firstNeed,
    location: company.location || inferLocation(company),
    identifiedFrom: company.data_source_url ? 'URL Research' : 'Sector Scan',
  };
}

function inferLocation(company) {
  const sectorLocations = {
    SaaS: 'Bengaluru',
    Fintech: 'Mumbai',
    Logistics: 'Pune',
    Healthcare: 'Hyderabad',
    Agriculture: 'Nashik',
  };
  return sectorLocations[company.sector] || 'India';
}
