import * as sourceUrlService from '../services/sourceUrlService.js';

export async function list(req, res, next) {
  try {
    const { source_id: sourceId, company_id: companyId, verification_status: verificationStatus } = req.query;
    const sourceUrls = await sourceUrlService.listSourceUrls({ sourceId, companyId, verificationStatus });
    return res.status(200).json({ source_urls: sourceUrls });
  } catch (error) {
    return next(error);
  }
}

export async function getById(req, res, next) {
  try {
    const sourceUrl = await sourceUrlService.getSourceUrlById(req.params.id);
    return res.status(200).json({ source_url: sourceUrl });
  } catch (error) {
    return next(error);
  }
}

export async function create(req, res, next) {
  try {
    const sourceUrl = await sourceUrlService.createSourceUrl(req.body);
    return res.status(201).json({ message: 'Source URL created successfully.', source_url: sourceUrl });
  } catch (error) {
    return next(error);
  }
}

export async function update(req, res, next) {
  try {
    const sourceUrl = await sourceUrlService.updateSourceUrl(req.params.id, req.body);
    return res.status(200).json({ message: 'Source URL updated successfully.', source_url: sourceUrl });
  } catch (error) {
    return next(error);
  }
}

export async function remove(req, res, next) {
  try {
    const sourceUrl = await sourceUrlService.deleteSourceUrl(req.params.id);
    return res.status(200).json({ message: 'Source URL deleted successfully.', source_url: sourceUrl });
  } catch (error) {
    return next(error);
  }
}
