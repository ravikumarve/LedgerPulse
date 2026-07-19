import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

const BASE_URL = "/api";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthOrganization {
  id: string;
  name: string;
  slug: string;
  role?: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  organization: AuthOrganization | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    name: string,
    organizationName: string
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getStoredToken(): string | null {
  try {
    return localStorage.getItem("lp_token");
  } catch {
    return null;
  }
}

function storeToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem("lp_token", token);
    } else {
      localStorage.removeItem("lp_token");
    }
  } catch {
    // localStorage unavailable
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: getStoredToken(),
    user: null,
    organization: null,
    loading: true,
  });

  // On mount, check if we have a stored token and validate it
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Session expired");
        return res.json();
      })
      .then((body) => {
        setState({
          token,
          user: body.data.user,
          organization: body.data.organization,
          loading: false,
        });
      })
      .catch(() => {
        storeToken(null);
        setState({ token: null, user: null, organization: null, loading: false });
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Login failed");

    storeToken(body.data.token);
    setState({
      token: body.data.token,
      user: body.data.user,
      organization: body.data.organization,
      loading: false,
    });
  }, []);

  const register = useCallback(
    async (email: string, password: string, name: string, organizationName: string) => {
      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, organizationName }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Registration failed");

      storeToken(body.data.token);
      setState({
        token: body.data.token,
        user: body.data.user,
        organization: body.data.organization,
        loading: false,
      });
    },
    []
  );

  const logout = useCallback(() => {
    storeToken(null);
    setState({ token: null, user: null, organization: null, loading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
