import express from 'express';
import { attachSystemUser } from '../middleware/systemUser.js';
import * as scrapeJobService from '../services/ingestion/scrapeJobService.js';

// Tender discovery: start a scrape and read how recent runs went. The work
// itself happens in a Cloud Run Job (see services/ingestion/scrapeJobService.js).
const router = express.Router();

router.use(attachSystemUser);

router.get('/scrape/status', async (_req, res, next) => {
  try {
    return res.status(200).json(await scrapeJobService.listExecutions());
  } catch (error) {
    return next(error);
  }
});

router.post('/scrape', async (_req, res, next) => {
  try {
    return res.status(202).json(await scrapeJobService.startScrape());
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
});

export default router;
