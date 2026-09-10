import nodemailer from "nodemailer";
import { decrypt } from "./crypto.js";

// Builds a Nodemailer transporter authenticated as the USER's own Gmail,
// using their Gmail App Password (never their real login password).
export const getTransporter = (user) => {
  if (!user.gmailConnected) {
    throw new Error("Gmail not connected. Add your Gmail + App Password first.");
  }
  const appPassword = decrypt(user.gmailAppPasswordEnc);
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: user.gmailAddress,
      pass: appPassword,
    },
  });
};
