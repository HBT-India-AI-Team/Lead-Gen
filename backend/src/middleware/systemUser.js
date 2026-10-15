// There is no login flow — the app runs as this fixed system account
// (matches the seeded admin row, src/db/seed.js DEFAULT_ADMIN) instead of
// requiring a JWT. Shaped like the old authenticateToken's decoded payload
// so every req.user.id / req.user.firstName / ... read downstream
// (userController, companyController, sourceController, leadController's
// resolveReviewerIdentity) keeps working unchanged.
const SYSTEM_USER = {
  id: 1,
  email: 'admin@sbi.com',
  firstName: 'System',
  lastName: 'Administrator',
  role: 'Admin',
};

export function attachSystemUser(req, res, next) {
  req.user = SYSTEM_USER;
  next();
}
