import * as companyService from '../services/companyService.js';

export async function list(req, res, next) {
  try {
    const { status, sector } = req.query;
    const companies = await companyService.listCompanies({ status, sector });
    return res.status(200).json({ companies });
  } catch (error) {
    return next(error);
  }
}

export async function getById(req, res, next) {
  try {
    const company = await companyService.getCompanyById(req.params.id);
    return res.status(200).json({ company });
  } catch (error) {
    return next(error);
  }
}

export async function create(req, res, next) {
  try {
    const company = await companyService.createCompany(req.body, req.user);
    return res.status(201).json({ message: 'Company created successfully.', company });
  } catch (error) {
    return next(error);
  }
}

export async function update(req, res, next) {
  try {
    const company = await companyService.updateCompany(req.params.id, req.body, req.user);
    return res.status(200).json({ message: 'Company updated successfully.', company });
  } catch (error) {
    return next(error);
  }
}

export async function remove(req, res, next) {
  try {
    const company = await companyService.deleteCompany(req.params.id, req.user);
    return res.status(200).json({ message: 'Company deleted successfully.', company });
  } catch (error) {
    return next(error);
  }
}
