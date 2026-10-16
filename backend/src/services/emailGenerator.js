const GENERIC_RESEARCH_LINE = 'We have initiated research on your company';

const PRODUCT_CATALOG = {
  tender: [
    'Bank Guarantee for bid, performance and retention money requirements',
    'Cash Credit or Working Capital Demand Loan for mobilization, payroll and supplier advances',
    'Supply Chain Finance or Invoice Discounting to bridge receivables after milestone billing'
  ],
  expansion: [
    'Term Loan for project setup, machinery, fit-outs and implementation costs',
    'Cash Credit for inventory and operating cycles during ramp-up',
    'Cash Management Services for vendor, payroll and collection flows'
  ],
  funding: [
    'Working Capital Finance to convert growth plans into day-to-day execution capacity',
    'Current Account and Cash Management Services for stronger treasury control',
    'Corporate Internet Banking and payment solutions for scalable collections and payouts'
  ],
  export: [
    'Letter of Credit and Bank Guarantee facilities for buyer and supplier commitments',
    'Export Packing Credit and Post-Shipment Finance for order-to-cash cycles',
    'Forex and Trade Finance advisory for cross-border settlement planning'
  ],
  equipment: [
    'Equipment Finance for machinery, fleet, medical equipment or automation assets',
    'Term Loan for related installation and project costs',
    'Cash Credit for spares, consumables and operating expenses'
  ],
  growth: [
    'Working Capital Finance for larger order books and operating cycles',
    'Cash Credit to manage inventory, receivables and supplier payments',
    'Cash Management Services for collections, payments and account visibility'
  ]
};

export async function generateProposalEmail(company, predictiveNeed = {}, options = {}) {
  const context = buildEmailContext(company, predictiveNeed);
  const prompt = buildEmailPrompt(context);
  const llmDraft = await generateWithLlm(prompt, options);
  return sanitizeEmailDraft(llmDraft) || buildFallbackEmail(context);
}

export function buildProposalSummary(company, predictiveNeed = {}) {
  const context = buildEmailContext(company, predictiveNeed);
  return `${context.primaryProduct} proposal for ${company.name}, linked to ${context.achievement.toLowerCase()} and the expected ${context.financialNeed.toLowerCase()}.`;
}

export function shouldRegenerateDraft(draft = '') {
  return !draft || draft.includes(GENERIC_RESEARCH_LINE);
}

function buildEmailContext(company = {}, predictiveNeed = {}) {
  const signalText = [
    company.name,
    company.sector,
    company.focus_area,
    company.data_source_url,
    company.tags,
    predictiveNeed.service_name,
    predictiveNeed.trigger_signal
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const scenario = detectScenario(signalText, company.sector);
  const achievement = achievementForScenario(scenario, company);
  const financialNeed = financialNeedForScenario(scenario, company);
  const products = PRODUCT_CATALOG[scenario] || PRODUCT_CATALOG.growth;

  return {
    companyName: company.name || 'your organization',
    sector: company.sector || 'your sector',
    focusArea: company.focus_area || sectorFocus(company.sector),
    signal: predictiveNeed.trigger_signal || achievement,
    scenario,
    achievement,
    financialNeed,
    primaryProduct: products[0],
    products
  };
}

function detectScenario(text, sector) {
  if (/(tender|procurement|government contract|gem|cppp|bid|work order|purchase order)/.test(text)) return 'tender';
  if (/(export|import|cross-border|foreign buyer|letter of credit|global|eu)/.test(text)) return 'export';
  if (/(machinery|equipment|automation|fleet|vehicle|medical equipment|plant)/.test(text)) return 'equipment';
  if (/(funding|series|raised|investment|venture|capital infusion)/.test(text)) return 'funding';
  if (/(expansion|new branch|new facility|capacity|warehouse|cold storage|distribution license)/.test(text)) return 'expansion';
  if (sector === 'Agriculture') return 'tender';
  if (sector === 'Logistics' || sector === 'Healthcare') return 'equipment';
  if (sector === 'Fintech') return 'export';
  return 'growth';
}

function achievementForScenario(scenario, company) {
  const sector = company.sector || 'business';
  const achievements = {
    tender: `Congratulations on the recent tender or contract opportunity connected with your ${sector.toLowerCase()} growth plans`,
    expansion: `Congratulations on the expansion momentum your team is building in ${sector}`,
    funding: `Congratulations on the fresh growth capital and the confidence it signals in your business`,
    export: `Congratulations on the cross-border growth opportunity your team is pursuing`,
    equipment: `Congratulations on the planned capacity upgrade and operational scale-up`,
    growth: `Congratulations on the recent growth signals around your business`
  };
  return achievements[scenario] || achievements.growth;
}

function financialNeedForScenario(scenario, company) {
  const focus = company.focus_area && company.focus_area !== 'Pending Analysis'
    ? company.focus_area.toLowerCase()
    : sectorFocus(company.sector).toLowerCase();

  const needs = {
    tender: `working capital for project mobilization, supplier advances, payroll, performance security and milestone-driven receivables`,
    expansion: `project funding, working capital buffers, inventory build-up and payments discipline while the new capacity stabilizes`,
    funding: `treasury control, disciplined working capital limits and scalable payment infrastructure as spending accelerates`,
    export: `trade limits, foreign exchange planning, shipment finance and receivable support across the order-to-cash cycle`,
    equipment: `asset finance, project funding and working capital for ${focus}`,
    growth: `higher working capital limits, receivables support and cash-flow visibility as business volumes increase`
  };
  return needs[scenario] || needs.growth;
}

function sectorFocus(sector) {
  return {
    SaaS: 'digital subscriptions and enterprise collections',
    Fintech: 'payments and settlement operations',
    Logistics: 'fleet, warehousing and fulfilment operations',
    Healthcare: 'equipment, facilities and care delivery',
    Agriculture: 'procurement, storage and distribution'
  }[sector] || 'business operations';
}

function buildEmailPrompt(context) {
  return [
    'Write a personalized relationship-manager email from our bank.',
    '',
    'Requirements:',
    '- Start by congratulating the customer on the recent achievement.',
    '- Explain how the achievement can create financial needs such as working capital, project funding, guarantees, trade finance, receivables support or cash management.',
    '- Recommend relevant banking products from the provided product list.',
    '- Make the email longer, customer-oriented, warm, consultative and conversational.',
    '- Avoid generic research language. Do not write: "We are researching your company" or "We have initiated research on your company."',
    '- Do not invent exact loan amounts, rates, approval promises or compliance claims.',
    '- Include a practical next step for a short discussion with one of our relationship managers.',
    '',
    `Customer: ${context.companyName}`,
    `Sector: ${context.sector}`,
    `Focus area: ${context.focusArea}`,
    `Recent achievement: ${context.achievement}`,
    `Likely financial need: ${context.financialNeed}`,
    `Recommended products: ${context.products.join('; ')}`,
    '',
    'Return only the email body.'
  ].join('\n');
}

async function generateWithLlm(prompt, options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return '';

  const baseUrl = (options.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.65,
        messages: [
          {
            role: 'system',
            content: 'You write compliant, specific and helpful B2B banking outreach emails for bank relationship managers.'
          },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) return '';
    const payload = await response.json();
    return payload.choices?.[0]?.message?.content || '';
  } catch {
    return '';
  }
}

function sanitizeEmailDraft(draft = '') {
  const trimmed = draft.trim();
  if (!trimmed || shouldRegenerateDraft(trimmed)) return '';
  return trimmed;
}

function buildFallbackEmail(context) {
  const [primaryProduct, secondaryProduct, tertiaryProduct] = context.products;

  return `Dear ${context.companyName} Team,

${context.achievement}. It is always encouraging to see a business reach a point where new orders, new markets or new capacity can translate into the next stage of growth.

At the same time, achievements like this often create very practical financial requirements. You may need funds to mobilize people and materials, pay suppliers before customer receipts come in, arrange guarantees or security deposits, or keep enough liquidity available while project milestones and collections move at different speeds. In other words, the opportunity is positive, but the cash-flow planning around it matters just as much as the win itself.

Based on your ${context.sector} profile and the signal around ${context.focusArea}, we can support you with ${primaryProduct}. This can be paired with ${secondaryProduct} so day-to-day expenses, vendor payments and receivables are easier to manage while the new opportunity is being executed. Where relevant, we can also explore ${tertiaryProduct} to give your finance team more flexibility across the full operating cycle.

We would be happy to understand the project timeline, expected billing milestones, supplier payment terms and any guarantee requirements. With that context, our relationship manager can suggest a banking structure that is practical for your current requirement and scalable for future opportunities.

Would you be open to a short discussion this week to map the opportunity against the right working capital, project funding and transaction banking options?

Warm regards,
Relationship Manager Team`;
}
