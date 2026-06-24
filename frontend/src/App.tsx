import "./App.css";
import { AgendasPanel } from "./AgendasPanel";
import { ConversationsPanel } from "./ConversationsPanel";
import { ErrorBoundary } from "./ErrorBoundary";
import { HealthPanel } from "./HealthPanel";
import { Login } from "./Login";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "./useAuth";
import { UsersPanel } from "./UsersPanel";

function App() {
  const { token, userId, username, role, setSession, logout } = useAuth();

  if (!token) {
    return <Login onAuthenticated={setSession} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>WhatsApp Calendar — Admin</h1>
        <div className="header-actions">
          <ThemeToggle />
          <div className="session">
            <span>
              {username} <span className="pill pill-warn">{role}</span>
            </span>
            <button onClick={logout}>Salir</button>
          </div>
        </div>
      </header>
      <main>
        <ErrorBoundary>
          <HealthPanel token={token} />
        </ErrorBoundary>
        <ErrorBoundary>
          <AgendasPanel token={token} />
        </ErrorBoundary>
        <ErrorBoundary>
          <ConversationsPanel token={token} role={role} />
        </ErrorBoundary>
        {role === "admin" && (
          <ErrorBoundary>
            <UsersPanel token={token} currentUserId={userId} />
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}

export default App;
