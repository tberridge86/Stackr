export function hasTrustedStackrAdminClaim(user) {
  return user?.app_metadata?.stackr_admin === true;
}

