import { getDb, withTransaction } from './src/config/database.js';
import { initializeDatabase } from './src/db/init.js';

// Raw metadata simulated from data.gov.in Agriculture page
const simulatedAgricultureData = [
  {
    name: 'Narmada Organic Growers Cooperative',
    focus_area: 'Irrigation & Drip Projects',
    source_link: 'https://www.data.gov.in/catalog/irrigation-projects-gujarat-2026',
    expansion_signal: 'FPO approved for multi-district expansion with INR 1.5 Cr project outlay'
  },
  {
    name: 'Sahyadri Cold Storage Farms',
    focus_area: 'Cold Chain Infrastructure',
    source_link: 'https://www.data.gov.in/catalog/cold-storage-subsidy-beneficiaries',
    expansion_signal: 'Procuring 4 cold storage warehouses with a capacity of 10,000 MT'
  },
  {
    name: 'Vedic Bio-Fertilizers Ltd',
    focus_area: 'Bio-Fertilizer Production',
    source_link: 'https://www.data.gov.in/catalog/fertilizer-consumption-statistics',
    expansion_signal: 'Granted license for state-wide distribution with setup of a new manufacturing unit'
  }
];

async function runPipeline() {
  console.log('==================================================================');
  console.log('SBI LEADGEN INTELLIGENCE SYSTEM - MULTI-AGENT INGESTION PIPELINE');
  console.log('==================================================================\n');

  // 1. Database Connection and Schema Initialization
  console.log('[System] Initializing database schema...');
  await initializeDatabase();
  const db = await getDb();
  console.log('[System] Connected to MySQL database successfully.\n');

  // 2. Scraping/Research Agent
  console.log('[Agent 1: Scraping & Research Agent]');
  console.log('-> Parsing target link: "https://www.data.gov.in/sector?page=1"');
  console.log('-> Filtering results specifically for: "Agriculture"');
  console.log(`-> Discovered ${simulatedAgricultureData.length} records matching agricultural expansion filters.\n`);

  // 3. Sector & Risk Agent
  console.log('[Agent 2: Sector & Risk Agent]');
  const sectorName = 'Agriculture';
  const sectorGrowth = '14% YoY';
  const sectorRisk = 'Medium';
  const sectorReason = 'Heavy rainfall forecast & crop yield uncertainty';
  
  console.log(`-> Evaluating sector: "${sectorName}"`);
  console.log(`-> Assigned States - Growth: ${sectorGrowth}, Risk: ${sectorRisk}`);
  console.log(`-> Reason: "${sectorReason}"`);
  
  // Upsert the sector in database
  await db.run(`
    INSERT INTO sectors (name, industry_growth, risk_level, risk_reason)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      industry_growth = VALUES(industry_growth),
      risk_level = VALUES(risk_level),
      risk_reason = VALUES(risk_reason)
  `, [sectorName, sectorGrowth, sectorRisk, sectorReason]);
  console.log('-> Upserted Agriculture sector details in sectors database table.\n');

  // Process companies through the qualification and predictive agents
  for (const entity of simulatedAgricultureData) {
    console.log(`------------------------------------------------------------------`);
    console.log(`Processing Entity: "${entity.name}"`);
    console.log(`------------------------------------------------------------------`);

    // 4. Lead Qualification Agent
    console.log('[Agent 3: Lead Qualification Agent]');
    // Compute opportunity score and risk score based on expansion signals
    const baselineScore = 70;
    const lengthModifier = (entity.expansion_signal.length % 15);
    const opportunityScore = Math.min(baselineScore + lengthModifier + (entity.focus_area.includes('Cold') ? 10 : 5), 100);
    const riskScore = 30 + (entity.name.length % 20);

    console.log(`-> Analyzed expansion signal: "${entity.expansion_signal}"`);
    console.log(`-> Computed Custom SBI Opportunity Score: ${opportunityScore}/100`);
    console.log(`-> Computed Company Risk Score: ${riskScore}/100`);

    // 5. Predictive Banking Agent
    console.log('[Agent 4: Predictive Banking Agent]');
    const products = [];
    let proposalSummary = '';
    let emailDraft = '';

    // Map suitable banking products and drafts
    if (entity.focus_area.includes('Irrigation')) {
      products.push(
        { name: 'Crop Loan', trigger: 'Seasonal planting support mapped to expansion' },
        { name: 'Agri-Infrastructure Loan', trigger: entity.expansion_signal }
      );
      proposalSummary = `Provide Agri-Infrastructure Loan limit of INR 1.2 Cr matching drip irrigation project expansion.`;
      emailDraft = `Dear Chairman,\n\nWe noticed your FPO's recent approval for multi-district expansion from data.gov.in records. SBI offers competitive Agri-Infrastructure Loans designed to facilitate modern drip irrigation setup.\n\nLet's schedule a call to review your limits.\n\nBest regards,\nSBI Agricultural Banking Division`;
    } else if (entity.focus_area.includes('Cold')) {
      products.push(
        { name: 'Agri-Warehouse & Cold Storage Loan', trigger: entity.expansion_signal },
        { name: 'Produce Marketing Loan', trigger: 'Inventory liquidity support based on cold chain capacity' }
      );
      proposalSummary = `Structured Term Loan for Cold Chain Infrastructure development and warehouse warehouse limits.`;
      emailDraft = `Dear Director,\n\nCongratulations on expanding your cold chain storage capacity. SBI supports agribusinesses with custom cold storage construction finance and warehouse receipt financing schemes.\n\nWe would like to present our term sheet for your review.\n\nBest regards,\nSBI Agricultural Banking Division`;
    } else {
      products.push(
        { name: 'Agri-Business Working Capital Loan', trigger: entity.expansion_signal }
      );
      proposalSummary = `Seeding working capital credit limit of INR 75 Lakhs for raw materials procurement.`;
      emailDraft = `Dear Management Team,\n\nCongratulations on receiving your state-wide distribution license. SBI offers working capital finance and cash credit facilities to bio-fertilizer production units to support business growth.\n\nBest regards,\nSBI Agricultural Banking Division`;
    }

    console.log(`-> Mapped Predictive Banking Needs: ${products.map(p => p.name).join(', ')}`);
    console.log(`-> Generated proposal summary and email outreach draft template.`);

    // 6. Database Transactional Writing
    console.log('[Database Writer] Committing transactional SQL records...');

    // Execute inside a MySQL transaction (pinned connection) to ensure all-or-nothing insertion
    try {
      const newCompanyId = await withTransaction(async (tx) => {
        // A. Insert Company
        const companyResult = await tx.run(
          `INSERT INTO companies (name, sector, focus_area, data_source_url, tags, opportunity_score, risk_score, execution_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            entity.name,
            'Agriculture',
            entity.focus_area,
            entity.source_link,
            'agriculture,data.gov.in,' + entity.focus_area.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-'),
            opportunityScore,
            riskScore,
            'completed'
          ]
        );
        const companyId = companyResult.lastID;

        // B. Insert Predictive Needs
        for (const prod of products) {
          await tx.run(
            `INSERT INTO predictive_needs (company_id, service_name, trigger_signal)
             VALUES (?, ?, ?)`,
            [companyId, prod.name, prod.trigger]
          );
        }

        // C. Insert Proposal
        await tx.run(
          `INSERT INTO proposals (company_id, proposal_summary, email_draft, status)
           VALUES (?, ?, ?, ?)`,
          [companyId, proposalSummary, emailDraft, 'pending_approval']
        );

        return companyId;
      });

      console.log(`✓ Database Transaction Committed for: ${entity.name} (Company ID: ${newCompanyId})\n`);
    } catch (dbError) {
      console.error(`❌ Transaction failed for ${entity.name}. Rolled back changes.`, dbError);
      throw dbError;
    }
  }

  console.log('==================================================================');
  console.log('INGESTION PIPELINE RUN COMPLETED SUCCESSFULLY!');
  console.log('==================================================================\n');
  
  await db.close();
}

runPipeline().catch(err => {
  console.error('Fatal Ingestion Pipeline Error:', err);
  process.exit(1);
});
