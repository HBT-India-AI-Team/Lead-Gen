import * as userService from '../services/userService.js';
import { ApiError } from '../utils/ApiError.js';
import { findMissingFields, isStrongPassword } from '../utils/validators.js';

export async function getProfile(req, res, next) {
  try {
    const profile = await userService.getProfileById(req.user.id);
    return res.status(200).json({ user: profile });
  } catch (error) {
    return next(error);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const missing = findMissingFields(req.body, ['first_name', 'last_name']);
    if (missing.length) {
      throw ApiError.badRequest(`Missing required field(s): ${missing.join(', ')}.`);
    }

    const profile = await userService.updateProfile(req.user.id, {
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      phone: req.body.phone,
      profile_image: req.body.profile_image,
      email: req.body.email,
    });

    return res.status(200).json({ message: 'Profile updated successfully.', user: profile });
  } catch (error) {
    return next(error);
  }
}

export async function changePassword(req, res, next) {
  try {
    const missing = findMissingFields(req.body, ['currentPassword', 'newPassword']);
    if (missing.length) {
      throw ApiError.badRequest(`Missing required field(s): ${missing.join(', ')}.`);
    }
    if (!isStrongPassword(req.body.newPassword)) {
      throw ApiError.badRequest('New password must be at least 8 characters and include at least one letter and one number.');
    }

    await userService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
    return res.status(200).json({ message: 'Password changed successfully.' });
  } catch (error) {
    return next(error);
  }
}
