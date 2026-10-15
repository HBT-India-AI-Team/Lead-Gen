-- SBI LeadGen Intelligence Platform — MySQL schema
--
-- Migrated 1:1 from the original SQLite schema (previously in
-- src/database.js). Table names, columns, primary keys, and foreign-key
-- relationships are preserved exactly. Only data types were adapted to
-- their closest MySQL-native equivalent:
--   SQLite INTEGER PRIMARY KEY AUTOINCREMENT -> MySQL INT AUTO_INCREMENT PRIMARY KEY
--   SQLite TEXT (unique/indexed columns)     -> MySQL VARCHAR(255) (TEXT cannot be UNIQUE-indexed without a key prefix)
--   SQLite TEXT (free-form long text)        -> MySQL TEXT (unchanged)
--   SQLite CHECK(...)                        -> MySQL CHECK(...) (native support since MySQL 8.0.16)
--
-- Applied automatically by src/db/init.js on server boot (CREATE TABLE IF
-- NOT EXISTS is idempotent — safe to run on every startup).

CREATE TABLE IF NOT EXISTS sectors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  industry_growth TEXT,
  risk_level VARCHAR(50),
  risk_reason TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Renamed from the original `companies` table to free up that name for the
-- Phase 3 production `companies` table below. Existing installs are
-- migrated automatically by src/db/init.js's migrateLegacyCompaniesTable()
-- (RENAME TABLE — MySQL updates the FKs in predictive_needs/proposals to
-- follow automatically). Still backs the legacy /api/v1/discovery and
-- /api/v1/proposals demo routes — untouched otherwise.
CREATE TABLE IF NOT EXISTS legacy_companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  sector VARCHAR(255),
  focus_area VARCHAR(255),
  data_source_url TEXT,
  tags TEXT,
  opportunity_score INT,
  risk_score INT,
  execution_status VARCHAR(20) NOT NULL,
  CONSTRAINT chk_execution_status CHECK (execution_status IN ('pending', 'completed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS predictive_needs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT,
  service_name VARCHAR(255),
  trigger_signal TEXT,
  CONSTRAINT fk_predictive_needs_company FOREIGN KEY (company_id) REFERENCES legacy_companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proposals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT,
  proposal_summary TEXT,
  email_draft TEXT,
  status VARCHAR(30) DEFAULT 'pending_approval',
  CONSTRAINT fk_proposals_company FOREIGN KEY (company_id) REFERENCES legacy_companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Authentication & user management (added for JWT auth sprint)
--
-- Existing installs (roles.name / lowercase status values) are migrated to
-- this shape automatically by src/db/init.js's migrateLegacyAuthSchema() —
-- CREATE TABLE IF NOT EXISTS alone cannot rename a column or change a
-- CHECK constraint on an already-existing table.

CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  role_id INT,
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  profile_image TEXT,
  last_login TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL,
  CONSTRAINT chk_users_status CHECK (status IN ('Active', 'Inactive'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Phase 3: core data foundation (companies / sources / scraping pipeline
-- shell / audit trail). No scraping, verification, or scoring logic is
-- implemented against these tables yet — schema + CRUD only.

CREATE TABLE IF NOT EXISTS companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL UNIQUE,
  website VARCHAR(500),
  sector VARCHAR(255),
  headquarters VARCHAR(255),
  company_type VARCHAR(100),
  company_size VARCHAR(50),
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_companies_status CHECK (status IN ('Active', 'Inactive'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Phase 4: Source Registry. `category` and `health_status` are constrained
-- to the Phase 4 spec's fixed value sets; `description` and `priority` were
-- added on top of the Phase 3 shape. Existing installs are migrated
-- automatically by src/db/init.js's migrateSourcesTableForRegistry().
CREATE TABLE IF NOT EXISTS sources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_name VARCHAR(255) NOT NULL UNIQUE,
  base_url VARCHAR(500) NOT NULL UNIQUE,
  category VARCHAR(50) DEFAULT 'Other',
  country VARCHAR(100),
  crawl_frequency VARCHAR(50),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  health_status VARCHAR(20) NOT NULL DEFAULT 'Healthy',
  last_run TIMESTAMP NULL DEFAULT NULL,
  description TEXT,
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_sources_category CHECK (category IN ('Government', 'Tender', 'Startup', 'News', 'Finance', 'Company', 'Other')),
  CONSTRAINT chk_sources_health_status CHECK (health_status IN ('Healthy', 'Warning', 'Offline'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS source_urls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_id INT NOT NULL,
  company_id INT NULL,
  url VARCHAR(500) NOT NULL UNIQUE,
  url_type VARCHAR(50),
  verification_status VARCHAR(50) NOT NULL DEFAULT 'Pending',
  discovered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_scraped_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_source_urls_source FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
  CONSTRAINT fk_source_urls_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scraping_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_url_id INT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Pending',
  started_at TIMESTAMP NULL DEFAULT NULL,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  records_found INT DEFAULT 0,
  cards_scanned INT DEFAULT 0,
  inserted_count INT DEFAULT 0,
  duplicate_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  error_message TEXT,
  CONSTRAINT fk_scraping_jobs_source_url FOREIGN KEY (source_url_id) REFERENCES source_urls(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scraped_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scraping_job_id INT NOT NULL,
  raw_html LONGTEXT,
  cleaned_text LONGTEXT,
  metadata_json JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_scraped_documents_job FOREIGN KEY (scraping_job_id) REFERENCES scraping_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Milestone 4: candidate lead profiles produced by LLM profiling of
-- scraped_documents rows. review_status is the human-in-the-loop gate —
-- rows sit at 'Pending' until a reviewer (future UI) approves/rejects them.
-- UNIQUE on scraped_document_id backstops the "not yet profiled" check the
-- profiling job runs at query time.
CREATE TABLE IF NOT EXISTS lead_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scraped_document_id INT NOT NULL,
  lead_score INT NOT NULL,
  summary TEXT,
  raw_llm_response JSON,
  review_status VARCHAR(30) NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lead_profiles_document FOREIGN KEY (scraped_document_id) REFERENCES scraped_documents(id) ON DELETE CASCADE,
  CONSTRAINT uq_lead_profiles_document UNIQUE (scraped_document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS research_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NULL,
  source_url_id INT NULL,
  action VARCHAR(100),
  status VARCHAR(50),
  remarks TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_research_history_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT fk_research_history_source_url FOREIGN KEY (source_url_id) REFERENCES source_urls(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  module VARCHAR(100),
  action VARCHAR(100),
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_activity_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- lead_category_settings — PROPOSED, NOT YET LIVE.
-- Backs the Settings → Lead Management per-category scoring/config tabs
-- (frontend/src/components/settings/LeadCategorySettings.tsx). Created by the
-- idempotent migration src/db/migrations/addLeadCategorySettings.js, which is
-- intentionally NOT run at server boot yet, and served by src/routes/settings.js,
-- which is intentionally NOT mounted yet. Until switched on (see the TODO in
-- settings.js) the frontend persists these settings to localStorage only and
-- says so honestly. Listed here so the canonical schema file documents the
-- intended shape. score_thresholds holds admin cutoffs for score types that
-- do not yet exist as computed values anywhere in this DB (only
-- opportunity_score/risk_score/lead_score are real — see scoringRules.js).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lead_category_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_key VARCHAR(100) NOT NULL,
  tender_value_min BIGINT NOT NULL DEFAULT 0,
  tender_value_max BIGINT NOT NULL DEFAULT 100000000,
  decision_window_days INT NOT NULL DEFAULT 30,
  score_thresholds JSON NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_lead_category_settings_key UNIQUE (category_key),
  CONSTRAINT chk_lcs_value_range CHECK (tender_value_max >= tender_value_min),
  CONSTRAINT chk_lcs_window CHECK (decision_window_days BETWEEN 1 AND 365)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
