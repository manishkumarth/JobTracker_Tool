export const ADMIN_EMAIL = "manish12099@gmail.com";

export const isAdminUser = (user) =>
  Boolean(user?.isAdmin) || user?.email?.toLowerCase() === ADMIN_EMAIL;
