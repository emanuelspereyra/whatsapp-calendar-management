import { useState } from "react";
import { login, register } from "./api";
import { ThemeToggle } from "./ThemeToggle";

export function Login({
  onAuthenticated
}: {
  onAuthenticated: (token: string, userId: string, username: string, role: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = mode === "login" ? await login(username, password) : await register(username, password, code);
      onAuthenticated(result.token, result.userId, result.username, result.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de autenticación");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-theme-toggle">
        <ThemeToggle />
      </div>
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>WhatsApp Calendar</h1>
        <div className="auth-tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Ingresar
          </button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
            Registrarse
          </button>
        </div>

        <label>
          Usuario
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            minLength={3}
            required
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            required
          />
        </label>
        {mode === "register" && (
          <label>
            Código de invitación
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Vacío si sos el primer usuario" />
          </label>
        )}

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={busy} className="auth-submit">
          {busy ? "..." : mode === "login" ? "Ingresar" : "Crear cuenta"}
        </button>
      </form>
    </div>
  );
}
