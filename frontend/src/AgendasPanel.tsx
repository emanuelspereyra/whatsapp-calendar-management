import { useEffect, useState } from "react";
import { fetchCalendarEvents, type CalendarEventRecord } from "./api";
import { Loading } from "./Loading";

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function AgendasPanel({ token }: { token: string }) {
  const [events, setEvents] = useState<CalendarEventRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!token) return;
    setError(null);
    try {
      const result = await fetchCalendarEvents(token, 10);
      setEvents(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agendas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) return null;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Últimas agendas</h2>
        <button onClick={load}>Actualizar</button>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <Loading label="Cargando agendas..." />
      ) : (
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Teléfono</th>
            <th>Clase (fecha y hora)</th>
            <th>Tema</th>
            <th>Estado</th>
            <th>Agendado el</th>
            <th>Calendar</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>{event.client?.name ?? "-"}</td>
              <td>{event.client?.phone ?? "-"}</td>
              <td>{formatDateTime(event.startDateTime)}</td>
              <td>{event.title}</td>
              <td>
                <span className={`pill pill-${statusTone(event.status)}`}>{event.status}</span>
              </td>
              <td>{formatDateTime(event.createdAt)}</td>
              <td>
                {event.calendarLink ? (
                  <a href={event.calendarLink} target="_blank" rel="noopener noreferrer">
                    Abrir
                  </a>
                ) : (
                  "-"
                )}
              </td>
            </tr>
          ))}
          {events.length === 0 && (
            <tr>
              <td colSpan={7} className="hint">
                Todavía no hay agendas registradas.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      )}
    </section>
  );
}

function statusTone(status: string): "ok" | "warn" | "down" {
  if (status === "created") return "ok";
  if (status === "conflict") return "warn";
  return "down";
}
