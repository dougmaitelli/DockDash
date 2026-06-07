import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Login() {
  const { enabled, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const error = new URLSearchParams(window.location.search).get("error");

  useEffect(() => {
    if (!isLoading && (!enabled || user)) {
      navigate("/", { replace: true });
    }
  }, [enabled, user, isLoading, navigate]);

  if (isLoading) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 p-10 rounded-xl border border-border bg-card shadow-lg w-full max-w-sm">
        <div className="flex flex-col items-center gap-2">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
          >
            <rect x="2" y="3" width="20" height="18" rx="3" />
            <path d="M8 3v18" />
            <path d="M16 8h2" />
            <path d="M16 12h2" />
            <path d="M16 16h2" />
          </svg>
          <h1 className="text-2xl font-bold">DockDash</h1>
        </div>

        <p className="text-sm text-muted-foreground text-center">Sign in to continue</p>

        {error && (
          <p className="text-sm text-destructive text-center">
            Authentication failed. Please try again.
          </p>
        )}

        <a href="/auth/login" className="w-full no-underline">
          <button className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer">
            Login with SSO
          </button>
        </a>
      </div>
    </div>
  );
}

export default Login;
