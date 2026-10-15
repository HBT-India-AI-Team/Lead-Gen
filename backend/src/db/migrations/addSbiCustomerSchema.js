import { exec, get, run } from '../../config/database.js';

// Demo/stand-in dataset for the "SBI Customer Check" workflow step. There is
// no real SBI customer-master integration in this system — matching lives
// entirely behind src/repositories/sbiCustomerRepository.js's
// findByCompanyName(), so swapping this seeded table for a real customer
// data source later never requires touching the service/controller/route/
// frontend layers above it.

async function createSbiCustomersTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS sbi_existing_customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_name VARCHAR(255) NOT NULL,
      cin VARCHAR(50) NULL,
      segment VARCHAR(100) NULL,
      relationship_manager VARCHAR(255) NULL,
      customer_since DATE NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

// One row is a real winning_company_name already present in `tenders`
// (tender TRBPxjC-175970) so the demo has a genuine YES hit; the rest are
// fictitious, clearly demo-only names.
const DEMO_CUSTOMERS = [
  { customer_name: 'M/s. japtech engicorp private limited', cin: 'U74999DL2015PTC281234', segment: 'MSME', relationship_manager: 'Anita Rao', customer_since: '2019-03-14' },
  { customer_name: 'Bluewater Infra Solutions Pvt Ltd', cin: 'U45201MH2012PTC229981', segment: 'Corporate', relationship_manager: 'Vikram Shah', customer_since: '2016-07-01' },
  { customer_name: 'Sundari Textiles Limited', cin: 'U17110TN2008PLC067812', segment: 'Mid-Corporate', relationship_manager: 'Priya Menon', customer_since: '2014-11-20' },
  { customer_name: 'Northline Logistics Pvt Ltd', cin: 'U63090DL2017PTC318765', segment: 'MSME', relationship_manager: 'Anita Rao', customer_since: '2021-01-09' },
  { customer_name: 'Greenfield AgriExports Pvt Ltd', cin: 'U01100GJ2010PTC060112', segment: 'Corporate', relationship_manager: 'Vikram Shah', customer_since: '2013-05-30' },
];

async function seedSbiCustomersIfEmpty() {
  const row = await get('SELECT COUNT(*) AS count FROM sbi_existing_customers');
  if (row?.count > 0) return;

  console.log('[DB Migrate] Seeding sbi_existing_customers demo dataset...');

  for (const customer of DEMO_CUSTOMERS) {
    await run(
      `INSERT INTO sbi_existing_customers (customer_name, cin, segment, relationship_manager, customer_since)
       VALUES (?, ?, ?, ?, ?)`,
      [customer.customer_name, customer.cin, customer.segment, customer.relationship_manager, customer.customer_since]
    );
  }
}

export async function ensureSbiCustomerSchema() {
  await createSbiCustomersTable();
  await seedSbiCustomersIfEmpty();
}
