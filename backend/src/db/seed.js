import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import { run, get } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);

const SALT_ROUNDS = 10;

const SEED_ROLES = [
  ['Admin', 'Full system access and user management'],
  ['Relationship Manager', 'Manages leads, companies, and proposals'],
];

const DEFAULT_ADMIN = {
  firstName: 'System',
  lastName: 'Administrator',
  email: 'admin@leadgen.local',
  password: 'Admin@123',
};

// Same dummy/demo dataset the original SQLite `initializeDatabase()` seeded
// in src/database.js — table names, row content, and insert order are
// unchanged; only the mechanism (parameterized INSERTs against MySQL
// instead of one literal multi-row SQLite INSERT) differs.

const SEED_SECTORS = [
  ['SaaS', '18% YoY', 'Low', 'High recurring revenue stability and digital adoption'],
  ['Fintech', '22% YoY', 'Medium', 'Increasing regulatory scrutiny and cybersecurity concerns'],
  ['Logistics', '12% YoY', 'High', 'Fuel price volatility and supply chain disruption vulnerabilities'],
];

const SEED_COMPANIES = [
  ['LogiTech Solutions', 'Logistics', 'Warehouse Automation', 'https://logitechsolutions.com', 'automation,logistics,b2b', 85, 60, 'completed'],
  ['SaaSify Inc', 'SaaS', 'Enterprise CRM', 'https://saasify.io', 'crm,saas,enterprise', 92, 25, 'completed'],
  ['FinPay Global', 'Fintech', 'Cross-border Payments', 'https://finpayglobal.com', 'payments,fintech,global', 78, 45, 'pending'],
];

// company_id below matches SEED_COMPANIES insert order (1, 2, 3), exactly
// as the original SQLite seed relied on AUTOINCREMENT starting at 1.
const SEED_NEEDS = [
  [1, 'Working Capital Loan', 'Seasonal inventory buildup signal identified in logistics records'],
  [2, 'Cash Management Services', 'Rapid expansion in multiple states detected via job postings'],
  [3, 'Trade Finance (LC)', 'New cross-border trade agreement announcement with EU partners'],
];

// Phase 4: Source Registry — trusted default sources the AI pipeline reads
// instead of hardcoded URLs. `lastRunHoursAgo` is converted to a `last_run`
// timestamp at seed time (or left NULL if omitted, meaning "never run").
const SEED_SOURCES = [
  {
    source_name: 'GeM (Government e-Marketplace)',
    base_url: 'https://gem.gov.in',
    category: 'Tender',
    country: 'India',
    crawl_frequency: 'Daily',
    enabled: true,
    health_status: 'Healthy',
    description: 'Government e-Marketplace — tracks government tenders, bids, and procurement opportunities across India.',
    priority: 5,
    lastRunHoursAgo: 4,
  },
  {
    source_name: 'CPPP (Central Public Procurement Portal)',
    base_url: 'https://eprocure.gov.in',
    category: 'Tender',
    country: 'India',
    crawl_frequency: 'Daily',
    enabled: true,
    health_status: 'Healthy',
    description: 'Central Public Procurement Portal — government tender notices and bid documents.',
    priority: 4,
    lastRunHoursAgo: 6,
  },
  {
    source_name: 'Startup India',
    base_url: 'https://www.startupindia.gov.in',
    category: 'Startup',
    country: 'India',
    crawl_frequency: 'Weekly',
    enabled: true,
    health_status: 'Healthy',
    description: 'Official Startup India registry — recognized startups, funding programs, and scheme updates.',
    priority: 4,
    lastRunHoursAgo: 30,
  },
  {
    source_name: 'MCA (Ministry of Corporate Affairs)',
    base_url: 'https://www.mca.gov.in',
    category: 'Government',
    country: 'India',
    crawl_frequency: 'Daily',
    enabled: true,
    health_status: 'Healthy',
    description: 'Ministry of Corporate Affairs — company incorporation records and compliance filings.',
    priority: 5,
    lastRunHoursAgo: 3,
  },
  {
    source_name: 'NSE (National Stock Exchange)',
    base_url: 'https://www.nseindia.com',
    category: 'Finance',
    country: 'India',
    crawl_frequency: 'Hourly',
    enabled: true,
    health_status: 'Healthy',
    description: 'National Stock Exchange — listed company filings, announcements, and market data.',
    priority: 3,
    lastRunHoursAgo: 1,
  },
  {
    source_name: 'BSE (Bombay Stock Exchange)',
    base_url: 'https://www.bseindia.com',
    category: 'Finance',
    country: 'India',
    crawl_frequency: 'Hourly',
    enabled: true,
    health_status: 'Warning',
    description: 'Bombay Stock Exchange — corporate announcements and listed company disclosures.',
    priority: 3,
    lastRunHoursAgo: 5,
  },
  {
    source_name: 'PIB (Press Information Bureau)',
    base_url: 'https://pib.gov.in',
    category: 'News',
    country: 'India',
    crawl_frequency: 'Daily',
    enabled: false,
    health_status: 'Healthy',
    description: 'Press Information Bureau — official government press releases and policy announcements.',
    priority: 2,
    lastRunHoursAgo: 48,
  },
  {
    source_name: 'Google News',
    base_url: 'https://news.google.com',
    category: 'News',
    country: 'Global',
    crawl_frequency: 'Hourly',
    enabled: true,
    health_status: 'Warning',
    description: 'Aggregated news signals used for company and sector-level monitoring.',
    priority: 2,
    lastRunHoursAgo: 2,
  },
  {
    source_name: 'Ministry of MSME',
    base_url: 'https://msme.gov.in',
    category: 'Government',
    country: 'India',
    crawl_frequency: 'Weekly',
    enabled: true,
    health_status: 'Offline',
    description: 'Ministry of Micro, Small and Medium Enterprises — schemes, registrations, and MSME sector data.',
    priority: 4,
    lastRunHoursAgo: null,
  },
];

const SEED_PROPOSALS = [
  [1, 'Working Capital facility of $2M to optimize supply chain inventory operations during peak seasons.', 'Dear CEO of LogiTech Solutions,\n\nWe noticed your expanding warehouse footprints and would like to offer a Working Capital Facility tailored for your seasonal demand.\n\nBest regards,\nRelationship Banking Team', 'pending_approval'],
  [2, 'Cash Management suite with automatic clearing and merchant services integration.', 'Dear CFO of SaaSify Inc,\n\nWe offer a state-of-the-art corporate cash management system that will streamline your recurring enterprise CRM billing.\n\nBest regards,\nRelationship Banking Team', 'pending_approval'],
  [3, 'Structured Trade Finance facility including Letter of Credit limits.', 'Dear Director of FinPay Global,\n\nCongratulations on your EU expansion. We offer competitive Trade Finance services, including LCs to secure your transaction flows.\n\nBest regards,\nRelationship Banking Team', 'pending_approval'],
];

/** Seeds the dummy dataset only if the sectors table is empty (mirrors the original bootstrap-once behavior). */
export async function seedIfEmpty() {
  const sectorCount = await get('SELECT COUNT(*) as count FROM sectors');
  if (sectorCount && sectorCount.count > 0) {
    console.log('[DB Seed] Existing data found — skipping seed.');
    return;
  }

  console.log('[DB Seed] Seeding initial dummy data...');

  for (const row of SEED_SECTORS) {
    await run('INSERT INTO sectors (name, industry_growth, risk_level, risk_reason) VALUES (?, ?, ?, ?)', row);
  }

  for (const row of SEED_COMPANIES) {
    await run(
      `INSERT INTO legacy_companies (name, sector, focus_area, data_source_url, tags, opportunity_score, risk_score, execution_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      row
    );
  }

  for (const row of SEED_NEEDS) {
    await run('INSERT INTO predictive_needs (company_id, service_name, trigger_signal) VALUES (?, ?, ?)', row);
  }

  for (const row of SEED_PROPOSALS) {
    await run('INSERT INTO proposals (company_id, proposal_summary, email_draft, status) VALUES (?, ?, ?, ?)', row);
  }

  console.log('[DB Seed] Database successfully seeded!');
}

/** Seeds default roles + the default admin user only if the roles table is empty. */
export async function seedAuthIfEmpty() {
  const roleCount = await get('SELECT COUNT(*) as count FROM roles');
  if (roleCount && roleCount.count > 0) {
    console.log('[DB Seed] Existing roles found — skipping auth seed.');
    return;
  }

  console.log('[DB Seed] Seeding default roles and admin user...');

  for (const [roleName, description] of SEED_ROLES) {
    await run('INSERT INTO roles (role_name, description) VALUES (?, ?)', [roleName, description]);
  }

  const adminRole = await get('SELECT id FROM roles WHERE role_name = ?', ['Admin']);
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN.password, SALT_ROUNDS);

  await run(
    `INSERT INTO users (first_name, last_name, email, phone, password_hash, role_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [DEFAULT_ADMIN.firstName, DEFAULT_ADMIN.lastName, DEFAULT_ADMIN.email, null, passwordHash, adminRole.id, 'Active']
  );

  console.log('[DB Seed] Default roles and admin user seeded!');
}

/** Seeds trusted data sources only if the sources table is empty. */
export async function seedSourcesIfEmpty() {
  const sourceCount = await get('SELECT COUNT(*) as count FROM sources');
  if (sourceCount && sourceCount.count > 0) {
    console.log('[DB Seed] Existing sources found — skipping source registry seed.');
    return;
  }

  console.log('[DB Seed] Seeding trusted data sources...');

  for (const source of SEED_SOURCES) {
    const lastRun = typeof source.lastRunHoursAgo === 'number'
      ? new Date(Date.now() - source.lastRunHoursAgo * 60 * 60 * 1000)
      : null;

    await run(
      `INSERT INTO sources (source_name, base_url, category, country, crawl_frequency, enabled, health_status, priority, description, last_run)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        source.source_name,
        source.base_url,
        source.category,
        source.country,
        source.crawl_frequency,
        source.enabled,
        source.health_status,
        source.priority,
        source.description,
        lastRun,
      ]
    );
  }

  console.log('[DB Seed] Trusted data sources seeded!');
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  Promise.resolve()
    .then(() => seedIfEmpty())
    .then(() => seedAuthIfEmpty())
    .then(() => seedSourcesIfEmpty())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[DB Seed] Fatal error while seeding:', error.message);
      process.exit(1);
    });
}
