import jwt from "jsonwebtoken";

const authMiddleware = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }
  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;

    // Block disabled accounts from performing any action (but allow /auth/me so the
    // client can detect the disabled state and show the support popup)
    const { default: User } = await import("../models/User.js");
    const user = await User.findById(req.userId).select("isDisabled isAdmin");
    const isMeCheck = req.originalUrl.endsWith("/auth/me") || req.path.endsWith("/me");
    if (user?.isDisabled && !isMeCheck) {
      return res.status(403).json({
        message: "Your account has been disabled. Please contact support.",
        disabled: true,
        contact: {
          name: "Manish Kumar",
          phone: "9798293519",
          email: "manish12099@gmail.com",
        },
      });
    }
    req.isAdmin = user?.isAdmin || false;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export default authMiddleware;
