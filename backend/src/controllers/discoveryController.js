import * as discoveryService from '../services/discoveryService.js';

// POST /api/v1/discovery/research
export async function research(req, res, next) {
  try {
    const company = await discoveryService.initiateResearch(req.body);
    return res.status(201).json({ message: 'Research placeholder successfully initiated.', company });
  } catch (error) {
    return next(error);
  }
}

// GET /api/v1/discovery/recommendations
export async function recommendations(req, res, next) {
  try {
    const { sector, minOpportunityScore, opportunityScore } = req.query;
    const results = await discoveryService.getRecommendations({ sector, minOpportunityScore, opportunityScore });
    return res.json(results);
  } catch (error) {
    return next(error);
  }
}