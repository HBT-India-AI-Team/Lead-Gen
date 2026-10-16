import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initializeDatabase } from './db/init.js';
import { ensureDocumentProcessingSchema } from './db/migrations/addDocumentProcessingSchema.js';
import { ensureCustomerCheckSchema } from './db/migrations/addCustomerCheckSchema.js';
import { ensureProbe42DemoSchema } from './db/migrations/addProbe42DemoSchema.js';
import { ensureTenderProposalSchema } from './db/migrations/addTenderProposalSchema.js';
import { ensureLeadQualificationSchema } from './db/migrations/addLeadQualificationSchema.js';
import { ensureProposalGenerationSchema } from './db/migrations/addProposalGenerationSchema.js';
import { ensureProposalReviewSchema } from './db/migrations/addProposalReviewSchema.js';
import { ensureCommunicationPreparationSchema } from './db/migrations/addCommunicationPreparationSchema.js';
import { ensureLeadDecisionEventsSchema } from './db/migrations/addLeadDecisionEventsSchema.js';
import { ensureMlModelMaintenanceSchema } from './db/migrations/addMlModelMaintenanceSchema.js';
import { ensureLeadSignalsSchema } from './db/migrations/addLeadSignalsSchema.js';
import discoveryRoutes from './routes/discovery.js';
import proposalsRoutes from './routes/proposals.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import companiesRoutes from './routes/companies.js';
import sourcesRoutes from './routes/sources.js';
import sourceUrlsRoutes from './routes/sourceUrls.js';
import researchHistoryRoutes from './routes/researchHistory.js';
import activityLogsRoutes from './routes/activityLogs.js';
import leadAnalysisRoutes from './routes/leadAnalysis.js';
import tendersRoutes from './routes/tenders.js';
import tenderProposalsRoutes from './routes/tenderProposals.js';
import leadsRoutes from './routes/leads.js';
import mlRoutes from './routes/ml.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Local dev origins are always allowed; deployed frontend origins (e.g. the
// Firebase Hosting URL) are added via CORS_ORIGINS as a comma-separated
// list, so a new environment needs no code change.
const LOCAL_ORIGINS = [
  'http://localhost:3000', 'http://127.0.0.1:3000',
  'http://localhost:3001', 'http://127.0.0.1:3001',
  'http://localhost:3002', 'http://127.0.0.1:3002',
  'http://localhost:5173', 'http://127.0.0.1:5173'
];

const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: [...LOCAL_ORIGINS, ...configuredOrigins],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middlewares
app.use(express.json());

// Mount API routes
app.use('/api/v1/discovery', discoveryRoutes);
app.use('/api/v1/proposals', proposalsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/sources', sourcesRoutes);
app.use('/api/source-urls', sourceUrlsRoutes);
app.use('/api/research-history', researchHistoryRoutes);
app.use('/api/activity-logs', activityLogsRoutes);
app.use('/api/lead-analysis', leadAnalysisRoutes);
app.use('/api/tenders', tendersRoutes);
app.use('/api/tender-proposals', tenderProposalsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/ml', mlRoutes);

// Root route for sanity check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Fintech Lead Intelligence API',
    version: '1.0.0'
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('[Error Handler]:', err);
  res.status(err.status || 500).json({
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected error occurred on the server.'
  });
});

// Initialize database and start the server
async function startServer() {
  try {
    console.log('Initializing MySQL database...');
    await initializeDatabase();

    // Ensures the tenders-workflow tables (tenders itself, plus the
    // customer-check/health-check/proposal demo tables) exist before the server
    // starts accepting requests — same idempotent guarded-ALTER pattern as
    // initializeDatabase() above, just for tables owned by jobs/features
    // that run independently of server boot rather than schema.sql.
    await ensureDocumentProcessingSchema();
    await ensureCustomerCheckSchema();
    await ensureProbe42DemoSchema();
    await ensureTenderProposalSchema();
    await ensureLeadQualificationSchema();
    await ensureLeadSignalsSchema();
    await ensureProposalGenerationSchema();
    await ensureProposalReviewSchema();
    await ensureCommunicationPreparationSchema();
    await ensureLeadDecisionEventsSchema();
    await ensureMlModelMaintenanceSchema();

    app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(`Fintech Lead Intelligence backend is ONLINE`);
      console.log(`Server URL: http://localhost:${PORT}`);
      console.log(`CORS enabled for origins: http://localhost:3000`);
      console.log(`====================================================`);
    });
  } catch (error) {
    console.error('Critical: Failed to boot the backend server:', error);
    process.exit(1);
  }
}

startServer();
