/**
 * Session state for the whole application.
 *
 * The server is the only authority on authentication: this provider simply
 * mirrors `auth.session`. Nothing about identity or role is ever cached in
 * localStorage, because a value stored there can be edited by any script that
 * gets a foothold, and would then be trusted by the UI.
 *
 * An idle-expiry warning is raised before the session lapses so a customer does
 * not lose a half-finished intake form.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { trpc } from "./trpc";

export type UserRole = "customer" | "staff" | "admin";

export interface SessionUser {
  id: number;
  email: string;
  role: UserRole;
  firstName: string | null;
  lastName: string | null;
  preferredName: string | null;
  displayName: string;
  company: string | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  onboardingCompleted: boolean;
  timezone: string | null;
}

interface SessionContextValue {
  loading: boolean;
  authenticated: boolean;
  user: SessionUser | null;
  /** Password accepted but the second factor has not been presented yet. */
  mfaPending: boolean;
  /** Signed in but confined to MFA enrolment (administrators without MFA). */
  restricted: boolean;
  maintenance: {
    enabled: boolean;
    showOnHomepage: boolean;
    blocksLogin: boolean;
    message: string;
    estimatedCompletion: string | null;
  } | null;
  registrationEnabled: boolean;
  sso: { enabled: boolean; name: string | null };
  passwordPolicy: {
    minLength: number;
    maxLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumber: boolean;
    requireSymbols: number;
    blockSequential: boolean;
  } | null;
  refresh: () => Promise<void>;
  isAdmin: boolean;
  isStaff: boolean;
  /** Seconds until the session is treated as expired, or null when unknown. */
  expiryWarning: boolean;
  dismissExpiryWarning: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Warn this many milliseconds before the assumed session lifetime elapses. */
const WARN_BEFORE_MS = 5 * 60 * 1000;

export function SessionProvider({ children }: { children: ReactNode }) {
  const query = trpc.auth.session.useQuery(undefined, {
    // The session is the root of every authorisation decision in the UI, so it
    // is refetched on focus and reconnect rather than trusted indefinitely.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });

  const [expiryWarning, setExpiryWarning] = useState(false);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissed = useRef(false);

  const data = query.data;
  const authenticated = data?.authenticated === true;

  const refresh = useCallback(async () => {
    dismissed.current = false;
    setExpiryWarning(false);
    await query.refetch();
  }, [query]);

  // Schedule the expiry warning from the session lifetime the server reports.
  useEffect(() => {
    if (warnTimer.current) clearTimeout(warnTimer.current);
    if (!authenticated) {
      setExpiryWarning(false);
      return;
    }
    const lifetimeMs = 12 * 60 * 60 * 1000;
    const delay = Math.max(lifetimeMs - WARN_BEFORE_MS, 60_000);
    warnTimer.current = setTimeout(() => {
      if (!dismissed.current) setExpiryWarning(true);
    }, delay);
    return () => {
      if (warnTimer.current) clearTimeout(warnTimer.current);
    };
  }, [authenticated, data]);

  const value = useMemo<SessionContextValue>(() => {
    const user = (data?.user ?? null) as SessionUser | null;
    return {
      loading: query.isLoading,
      authenticated,
      user,
      mfaPending: data?.mfaPending ?? false,
      restricted: data?.restricted ?? false,
      maintenance: data?.maintenance ?? null,
      registrationEnabled: data?.registrationEnabled ?? true,
      sso: data?.sso ?? { enabled: false, name: null },
      passwordPolicy: data?.passwordPolicy ?? null,
      refresh,
      isAdmin: user?.role === "admin",
      isStaff: user?.role === "admin" || user?.role === "staff",
      expiryWarning,
      dismissExpiryWarning: () => {
        dismissed.current = true;
        setExpiryWarning(false);
      },
    };
  }, [data, query.isLoading, authenticated, refresh, expiryWarning]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside a SessionProvider");
  return context;
}
