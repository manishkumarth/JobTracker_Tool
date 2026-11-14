import nodemailer from "nodemailer";
import { decrypt } from "./crypto.js";

// Builds a Nodemailer transporter for a Gmail address + App Password.
export const createTransporter = (address, appPassword) =>
  nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: address,
      pass: appPassword,
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
  });

// Builds a Nodemailer transporter authenticated as the USER's own Gmail,
// using their Gmail App Password (never their real login password).
// Kept for backward compatibility with the legacy single-account flow.
export const getTransporter = (user) => {
  if (!user.gmailConnected) {
    throw new Error("Gmail not connected. Add your Gmail + App Password first.");
  }
  const appPassword = decrypt(user.gmailAppPasswordEnc);
  return createTransporter(user.gmailAddress, appPassword);
};
