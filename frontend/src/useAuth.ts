import { useEffect, useState } from "react";
import { setUnauthorizedHandler } from "./api";

const TOKEN_KEY = "auth-token";
const USERNAME_KEY = "auth-username";
const ROLE_KEY = "auth-role";
const USER_ID_KEY = "auth-user-id";

function decodeExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const expiresAt = decodeExpiry(token);
  return expiresAt !== null && expiresAt <= Date.now();
}

export function useAuth() {
  const [token, setTokenState] = useState(() => {
    const stored = localStorage.getItem(TOKEN_KEY) ?? "";
    return stored && !isExpired(stored) ? stored : "";
  });
  const [username, setUsernameState] = useState(() => localStorage.getItem(USERNAME_KEY) ?? "");
  const [role, setRoleState] = useState(() => localStorage.getItem(ROLE_KEY) ?? "");
  const [userId, setUserIdState] = useState(() => localStorage.getItem(USER_ID_KEY) ?? "");

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(USER_ID_KEY);
    setTokenState("");
    setUsernameState("");
    setRoleState("");
    setUserIdState("");
  }

  function setSession(nextToken: string, nextUserId: string, nextUsername: string, nextRole: string) {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USERNAME_KEY, nextUsername);
    localStorage.setItem(ROLE_KEY, nextRole);
    localStorage.setItem(USER_ID_KEY, nextUserId);
    setTokenState(nextToken);
    setUsernameState(nextUsername);
    setRoleState(nextRole);
    setUserIdState(nextUserId);
  }

  useEffect(() => {
    if (!token) return;
    const expiresAt = decodeExpiry(token);
    if (expiresAt === null) return;
    const msUntilExpiry = expiresAt - Date.now();
    if (msUntilExpiry <= 0) {
      clearSession();
      return;
    }
    const timer = setTimeout(clearSession, msUntilExpiry);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, []);

  return { token, userId, username, role, setSession, logout: clearSession };
}
