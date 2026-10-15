import * as tenderService from '../services/tenderService.js';
import * as sbiCustomerCheckService from '../services/sbiCustomerCheckService.js';
import * as healthCheckService from '../services/healthCheckService.js';

export async function list(req, res, next) {
  try {
    const {
      search,
      category,
      source,
      state,
      district,
      lead_category: leadCategory,
      has_winner: hasWinner,
      amount_range: amountRange,
      date_range: dateRange,
      date_from: dateFrom,
      date_to: dateTo,
      pipeline_status: pipelineStatus,
      lead_status: leadStatus,
      page,
      limit,
      sort_by: sortBy,
      order,
    } = req.query;
    const result = await tenderService.listTenders({
      search,
      category,
      source,
      state,
      district,
      leadCategory,
      hasWinner,
      amountRange,
      dateRange,
      dateFrom,
      dateTo,
      pipelineStatus,
      leadStatus,
      page,
      limit,
      sortBy,
      order,
    });
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function categories(req, res, next) {
  try {
    const categories = await tenderService.listCategories();
    return res.status(200).json({ categories });
  } catch (error) {
    return next(error);
  }
}

export async function leadCategories(req, res, next) {
  try {
    const leadCategories = await tenderService.listLeadCategories();
    return res.status(200).json({ leadCategories });
  } catch (error) {
    return next(error);
  }
}

export async function states(req, res, next) {
  try {
    const states = await tenderService.listStates();
    return res.status(200).json({ states });
  } catch (error) {
    return next(error);
  }
}

export async function districts(req, res, next) {
  try {
    const districts = await tenderService.listDistricts(req.query.state);
    return res.status(200).json({ districts });
  } catch (error) {
    return next(error);
  }
}

export async function getById(req, res, next) {
  try {
    const tender = await tenderService.getTenderById(req.params.tenderId);
    return res.status(200).json({ tender });
  } catch (error) {
    return next(error);
  }
}

export async function sbiCheck(req, res, next) {
  try {
    const tender = await tenderService.getTenderById(req.params.tenderId);
    const companyChecked = tender.winning_company_name || tender.company_name;
    const { isExistingCustomer, matchedCustomer } = await sbiCustomerCheckService.checkSbiCustomer(companyChecked);

    return res.status(200).json({
      tenderId: tender.tender_id,
      companyChecked,
      isExistingCustomer,
      matchedCustomer,
    });
  } catch (error) {
    return next(error);
  }
}

export async function healthCheck(req, res, next) {
  try {
    const result = await healthCheckService.runHealthCheck(req.params.tenderId);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}
