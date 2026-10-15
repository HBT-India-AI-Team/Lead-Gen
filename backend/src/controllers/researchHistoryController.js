import * as researchHistoryService from '../services/researchHistoryService.js';

export async function list(req, res, next) {
  try {
    const { company_id: companyId, source_url_id: sourceUrlId, status } = req.query;
    const history = await researchHistoryService.listResearchHistory({ companyId, sourceUrlId, status });
    return res.status(200).json({ research_history: history });
  } catch (error) {
    return next(error);
  }
}

export async function getById(req, res, next) {
  try {
    const record = await researchHistoryService.getResearchHistoryById(req.params.id);
    return res.status(200).json({ research_history: record });
  } catch (error) {
    return next(error);
  }
}
