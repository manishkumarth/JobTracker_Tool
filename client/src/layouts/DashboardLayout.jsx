import { useState } from "react";
import { Outlet, useLocation, NavLink, useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import DisabledBanner from "../components/DisabledBanner.jsx";
import FeatureDisabledPopup from "../components/FeatureDisabledPopup.jsx";
import GmailSetupPopup from "../components/GmailSetupPopup.jsx";
import ExtensionInstallPopup from "../components/ExtensionInstallPopup.jsx";
import HowItWorks from "../components/HowItWorks.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { isAdminUser } from "../constants.js";

const pageNames = {
  "/dashboard": "Dashboard",
  "/applications": "Applications",
  "/companies": "Companies",
  "/contacts": "Contacts",
  "/emails": "Email History",
  "/templates": "Templates",
  "/followups": "Follow-ups",
  "/interviews": "Interviews",
  "/profile": "Candidate Profile",
  "/ai-settings": "Settings",
  "/admin": "Admin",
};

export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showGmailHelp, setShowGmailHelp] = useState(false);
  const [showExtHelp, setShowExtHelp] = useState(false);
  const basePath = "/" + location.pathname.split("/")[1];
  const pageName = pageNames[basePath] || "Dashboard";

  return (
    <div className="min-h-screen lg:flex bg-primary">
      <DisabledBanner />
      <FeatureDisabledPopup />
      {showGmailHelp && (
        <GmailSetupPopup
          onClose={() => setShowGmailHelp(false)}
          onConnected={() => {
            setShowGmailHelp(false);
            navigate("/ai-settings");
          }}
        />
      )}
      {showExtHelp && <ExtensionInstallPopup onClose={() => setShowExtHelp(false)} />}
      <Sidebar />
      <main className="flex-1 min-w-0">
        {/* Desktop top bar */}
        <div className="hidden lg:block sticky top-0 z-10 glass border-b border-color">
          <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-primary">{pageName}</h2>
            <div className="h-px flex-1 mx-6 bg-gradient-to-r from-transparent via-border-strong to-transparent" />
            {isAdminUser(user) && (
              <NavLink to="/admin" className="btn btn-secondary btn-sm text-danger">
                Admin
              </NavLink>
            )}
            <HowItWorks />
            <button
              onClick={() => setShowGmailHelp(true)}
              className="btn btn-secondary btn-sm"
              title="How to connect your Gmail App Password"
            >
              <svg className="w-4 h-4 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
              </svg>
              <span className="hidden sm:inline">Connect Gmail</span>
            </button>
            <button
              onClick={() => setShowExtHelp(true)}
              className="btn btn-secondary btn-sm"
              title="Install the Chrome extension for LinkedIn"
            >
              <svg
                className="w-4 h-4 text-brand-600 dark:text-brand-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="4" />
                <path d="M21.17 8H12" />
                <path d="M3.95 6.06 8.54 14" />
                <path d="M10.88 21.94 15.46 14" />
              </svg>
              <span className="hidden sm:inline">Chrome Extension</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
