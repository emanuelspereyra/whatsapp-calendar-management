import { useEffect, useState } from "react";
import { fetchHealth, fetchReadiness, type ReadinessResponse } from "./api";
import { Loading } from "./Loading";

export function HealthPanel({ token }: { token: string }) {
  const [health, setHealth] = useState<{ status: string; uptime: number } | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setError(null);
    try {
      setHealth(await fetchHealth());
      if (token) setReadiness(await fetchReadiness(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load health status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Estado del sistema</h2>
        <button onClick={refresh}>Actualizar</button>
      </div>
      {error && <p className="error">{error}</p>}
      {loading && !health ? (
        <Loading label="Consultando estado..." />
      ) : (
        <div className="status-grid">
          <StatusBadge label="Servidor" value={health?.status ?? "..."} />
          {readiness &&
            Object.entries(readiness.services).map(([service, status]) => (
              <StatusBadge key={service} label={service} value={status} />
            ))}
        </div>
      )}
    </section>
  );
}

function StatusBadge({ label, value }: { label: string; value: string }) {
  const tone = value === "ok" ? "ok" : value === "degraded" ? "warn" : "down";
  return (
    <div className={`badge badge-${tone}`}>
      <span className="badge-label">{label}</span>
      <span className="badge-value">{value}</span>
    </div>
  );
}
