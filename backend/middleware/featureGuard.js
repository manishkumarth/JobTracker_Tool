import User from "../models/User.js";

// Use AFTER authMiddleware (which sets req.userId).
// Admins always bypass. A user with the feature switched off gets a 403 the
// client can detect and turn into a "contact support" popup.
export const requireFeature = (feature) => async (req, res, next) => {
  const user = await User.findById(req.userId).select("features isAdmin");
  if (user?.isAdmin) return next();
  if (!user || user.features?.[feature] === false) {
    return res.status(403).json({
      message: `This feature has been disabled on your account. Please contact support.`,
      featureDisabled: feature,
    });
  }
  next();
};
