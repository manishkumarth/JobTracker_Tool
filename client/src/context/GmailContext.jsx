import { createContext, useCallback, useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import GmailSetupPopup from "../components/GmailSetupPopup.jsx";
import { useAuth } from "./AuthContext.jsx";

const GmailContext = createContext(null);

/**
 * Guards every "send email" flow. When Gmail is not connected the setup
 * popup appears instead of the request failing on the backend.
 */
export const GmailProvider = ({ children }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const requireGmail = useCallback(() => {
    if (user?.gmailConnected) return true;
    setOpen(true);
    return false;
  }, [user]);

  return (
    <GmailContext.Provider value={{ requireGmail }}>
      {children}
      {open && (
        <GmailSetupPopup
          onClose={() => setOpen(false)}
          onConnected={() => {
            setOpen(false);
            navigate("/ai-settings");
          }}
        />
      )}
    </GmailContext.Provider>
  );
};

export const useGmailGuard = () => useContext(GmailContext);
