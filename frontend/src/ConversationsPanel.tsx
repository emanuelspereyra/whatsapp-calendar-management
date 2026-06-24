import { useEffect, useState } from "react";
import {
  approveConversation,
  fetchConversations,
  rejectConversation,
  type ConversationRecord
} from "./api";
import { Loading } from "./Loading";

const STATUS_OPTIONS = [
  "",
  "idle",
  "collecting_information",
  "pending_confirmation",
  "missing_information",
  "confirmed_ready_to_schedule",
  "scheduled",
  "cancelled",
  "failed"
];

const PAGE_SIZE = 20;

export function ConversationsPanel({ token, role }: { token: string; role: string }) {
  const canManage = role === "admin";
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [skip, setSkip] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!token) return;
    setError(null);
    try {
      const result = await fetchConversations(token, { status: status || undefined, skip, take: PAGE_SIZE });
      setConversations(result.data);
      setTotal(result.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, status, skip]);

  async function handleAction(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      if (action === "approve") {
        await approveConversation(token, id);
      } else {
        await rejectConversation(token, id);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  if (!token) {
    return <p className="hint">Iniciá sesión para ver las conversaciones.</p>;
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Conversaciones</h2>
        <select
          value={status}
          onChange={(event) => {
            setSkip(0);
            setStatus(event.target.value);
          }}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option || "todos"}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <Loading label="Cargando conversaciones..." />
      ) : (
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th>Hora</th>
            <th>Tema</th>
            <th>Gestionado por</th>
            {canManage && <th>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {conversations.map((conversation) => (
            <tr key={conversation.id}>
              <td>{conversation.client?.name ?? conversation.client?.phone ?? conversation.clientId}</td>
              <td>{conversation.status}</td>
              <td>{conversation.proposedDate ?? "-"}</td>
              <td>{conversation.proposedTime ?? "-"}</td>
              <td>{conversation.proposedTopic ?? "-"}</td>
              <td>
                {conversation.approvedBy
                  ? `Aprobado por ${conversation.approvedBy.username}`
                  : conversation.rejectedBy
                    ? `Rechazado por ${conversation.rejectedBy.username}`
                    : "-"}
              </td>
              {canManage && (
                <td className="actions">
                  <button
                    disabled={busyId === conversation.id}
                    onClick={() => handleAction(conversation.id, "approve")}
                  >
                    Aprobar
                  </button>
                  <button
                    disabled={busyId === conversation.id}
                    className="secondary"
                    onClick={() => handleAction(conversation.id, "reject")}
                  >
                    Rechazar
                  </button>
                </td>
              )}
            </tr>
          ))}
          {conversations.length === 0 && (
            <tr>
              <td colSpan={canManage ? 7 : 6} className="hint">
                Sin conversaciones para este filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      )}
      <div className="pagination">
        <button disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>
          Anterior
        </button>
        <span>
          {skip + 1}-{Math.min(skip + PAGE_SIZE, total)} de {total}
        </span>
        <button disabled={skip + PAGE_SIZE >= total} onClick={() => setSkip(skip + PAGE_SIZE)}>
          Siguiente
        </button>
      </div>
    </section>
  );
}
