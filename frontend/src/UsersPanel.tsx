import { useEffect, useState } from "react";
import { fetchUsers, revokeUser, updateUserRole, type UserSummary } from "./api";
import { Loading } from "./Loading";

export function UsersPanel({ token, currentUserId }: { token: string; currentUserId: string }) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setError(null);
    try {
      const result = await fetchUsers(token);
      setUsers(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleRoleToggle(user: UserSummary) {
    const nextRole = user.role === "admin" ? "viewer" : "admin";
    setBusyId(user.id);
    setError(null);
    try {
      await updateUserRole(token, user.id, nextRole);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el rol");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevoke(user: UserSummary) {
    setBusyId(user.id);
    setError(null);
    try {
      await revokeUser(token, user.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar la sesión");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Usuarios</h2>
        <button onClick={load}>Actualizar</button>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <Loading label="Cargando usuarios..." />
      ) : (
      <table>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Rol</th>
            <th>Creado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                {user.username} {user.id === currentUserId && <span className="pill pill-ok">vos</span>}
              </td>
              <td>
                <span className={`pill ${user.role === "admin" ? "pill-warn" : "pill-ok"}`}>{user.role}</span>
              </td>
              <td>{new Date(user.createdAt).toLocaleDateString("es-AR")}</td>
              <td className="actions">
                <button disabled={busyId === user.id} className="secondary" onClick={() => handleRoleToggle(user)}>
                  {user.role === "admin" ? "Quitar admin" : "Hacer admin"}
                </button>
                <button disabled={busyId === user.id} className="secondary" onClick={() => handleRevoke(user)}>
                  Revocar sesión
                </button>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={4} className="hint">
                Sin usuarios.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      )}
    </section>
  );
}
