import "./App.css";
import { AgendasPanel } from "./AgendasPanel";
import { ConversationsPanel } from "./ConversationsPanel";
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
        <HealthPanel token={token} />
        <AgendasPanel token={token} />
        <ConversationsPanel token={token} role={role} />
        {role === "admin" && <UsersPanel token={token} currentUserId={userId} />}
      </main>
    </div>
  );
}

export default App;
