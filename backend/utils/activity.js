// Small helper to append a timeline entry to an Application without
// duplicating this logic across every route file.
export const logActivity = async (application, type, message, meta = {}) => {
  application.activity.push({ type, message, meta, at: new Date() });
  await application.save();
};
