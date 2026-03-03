import { useState } from "react";
import { downloadFile } from "../api";

// Formata datas para exibicao no filtro de periodo.
function formatDateBR(date) {
  return new Date(date).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// Tela administrativa para exportacao de relatórios.
export default function AdminReports() {
  const [error, setError] = useState("");
  const [dates, setDates] = useState({
    startDate: "",
    endDate: ""
  });

  // Monta URL com filtro de data (quando informado) e dispara download.
  async function dl(path, filename) {
    setError("");
    try {
      let fullPath = path;
      if (dates.startDate && dates.endDate) {
        const separator = path.includes("?") ? "&" : "?";
        fullPath = `${path}${separator}startDate=${encodeURIComponent(dates.startDate)}&endDate=${encodeURIComponent(dates.endDate)}`;
      }
      await downloadFile(fullPath, filename);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="container" style={{ padding: "16px 0" }}>
      <h2 className="page-title">Relatórios</h2>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="grid two">
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Downloads</h3>
          <p className="small" style={{ marginTop: 0 }}>Exporte relatórios do estoque e do histórico.</p>

          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={{ display: "block", fontSize: "12px", color: "var(--muted)", marginBottom: 4 }}>Data Inicial</label>
                <input
                  type="date"
                  value={dates.startDate}
                  onChange={(e) => setDates({ ...dates, startDate: e.target.value })}
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={{ display: "block", fontSize: "12px", color: "var(--muted)", marginBottom: 4 }}>Data Final</label>
                <input
                  type="date"
                  value={dates.endDate}
                  onChange={(e) => setDates({ ...dates, endDate: e.target.value })}
                  style={{ width: "100%" }}
                />
              </div>
            </div>
            {dates.startDate && dates.endDate && (
              <div className="small" style={{ color: "var(--accent)" }}>
                Filtrado de {formatDateBR(dates.startDate)} a {formatDateBR(dates.endDate)}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
            <button onClick={() => dl("/api/reports/stock.pdf", "estoque.pdf")}>Baixar Estoque (PDF)</button>
            <button onClick={() => dl("/api/reports/entries.pdf", "entradas.pdf")}>Baixar Entradas (PDF)</button>
            <button onClick={() => dl("/api/reports/exits.pdf", "saidas.pdf")}>Baixar Saídas (PDF)</button>
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Por Categoria (opcional)</h3>
          <p className="small" style={{ marginTop: 0 }}>
            Voce pode filtrar o estoque por categoria adicionando <code>Categoria=Limpeza</code> no link:
          </p>
        </div>
      </div>
    </div>
  );
}
