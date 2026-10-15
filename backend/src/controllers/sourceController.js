import * as sourceService from '../services/sourceService.js';

export async function list(req, res, next) {
  try {
    const { search, category, enabled, page, limit, sort_by: sortBy, order } = req.query;
    const result = await sourceService.listSources({ search, category, enabled, page, limit, sortBy, order });
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function getById(req, res, next) {
  try {
    const source = await sourceService.getSourceById(req.params.id);
    return res.status(200).json({ source });
  } catch (error) {
    return next(error);
  }
}

export async function create(req, res, next) {
  try {
    const source = await sourceService.createSource(req.body, req.user);
    return res.status(201).json({ message: 'Source created successfully.', source });
  } catch (error) {
    return next(error);
  }
}

export async function update(req, res, next) {
  try {
    const source = await sourceService.updateSource(req.params.id, req.body, req.user);
    return res.status(200).json({ message: 'Source updated successfully.', source });
  } catch (error) {
    return next(error);
  }
}

export async function remove(req, res, next) {
  try {
    const source = await sourceService.deleteSource(req.params.id, req.user);
    return res.status(200).json({ message: 'Source deleted successfully.', source });
  } catch (error) {
    return next(error);
  }
}

export async function updateStatus(req, res, next) {
  try {
    const source = await sourceService.updateSourceStatus(req.params.id, req.body, req.user);
    return res.status(200).json({ message: 'Source status updated successfully.', source });
  } catch (error) {
    return next(error);
  }
}

export async function updateHealth(req, res, next) {
  try {
    const source = await sourceService.updateSourceHealth(req.params.id, req.body, req.user);
    return res.status(200).json({ message: 'Source health updated successfully.', source });
  } catch (error) {
    return next(error);
  }
}

export async function recordRun(req, res, next) {
  try {
    const source = await sourceService.touchSourceLastRun(req.params.id, req.user);
    return res.status(200).json({ message: 'Source last run recorded successfully.', source });
  } catch (error) {
    return next(error);
  }
}

export async function updatePriority(req, res, next) {
  try {
    const source = await sourceService.updateSourcePriority(req.params.id, req.body, req.user);
    return res.status(200).json({ message: 'Source priority updated successfully.', source });
  } catch (error) {
    return next(error);
  }
}
