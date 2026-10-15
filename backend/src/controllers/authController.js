import * as authService from '../services/authService.js';
import { getProfileById } from '../services/userService.js';
import { ApiError } from '../utils/ApiError.js';
import { isValidEmail, findMissingFields } from '../utils/validators.js';

export async function login(req, res, next) {
  try {
    const missing = findMissingFields(req.body, ['email', 'password']);
    if (missing.length) {
      throw ApiError.badRequest(`Missing required field(s): ${missing.join(', ')}.`);
    }
    if (!isValidEmail(req.body.email)) {
      throw ApiError.badRequest('Please provide a valid email address.');
    }

    const { token, user, role } = await authService.login(req.body.email, req.body.password);
    return res.status(200).json({ message: 'Login successful.', token, user, role });
  } catch (error) {
    return next(error);
  }
}

export async function logout(req, res, next) {
  try {
    // Stateless JWT: there is no server-side session/blacklist table in
    // this schema, so "logout" is acknowledged here and the client is
    // responsible for discarding the token. The route stays authenticated
    // so only a caller with a currently-valid token can invoke it.
    return res.status(200).json({ message: 'Logout successful.' });
  } catch (error) {
    return next(error);
  }
}

export async function me(req, res, next) {
  try {
    const profile = await getProfileById(req.user.id);
    return res.status(200).json({ user: profile, role: profile.role });
  } catch (error) {
    return next(error);
  }
}
