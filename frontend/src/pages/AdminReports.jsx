import { useState } from "react";
import { downloadFile } from "../api";

const MONTH_OPTIONS = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" }
];

// Formata datas para exibicao no filtro de periodo.
function formatDateBR(date) {
  return new Date(date).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// Tela administrativa para exportacao de relatorios.
export default function AdminReports() {
  const [error, setError] = useState("");
  const [mode, setMode] = useState("date");
  const [dates, setDates] = useState({
    startDate: "",
    endDate: ""
  });
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [months, setMonths] = useState([]);

  function toggleMonth(monthValue) {
    setMonths((prev) =>
      prev.includes(monthValue) ? prev.filter((m) => m !== monthValue) : [...prev, monthValue].sort((a, b) => a - b)
    );
  }

  function setMonthsPreset(preset) {
    setMonths([...preset].sort((a, b) => a - b));
  }

  // Monta URL com filtro e dispara download.
  async function dl(path, filename) {
    setError("");
    try {
      let fullPath = path;
      if (mode === "date" && dates.startDate && dates.endDate) {
        const separator = path.includes("?") ? "&" : "?";
        fullPath = `${path}${separator}startDate=${encodeURIComponent(dates.startDate)}&endDate=${encodeURIComponent(dates.endDate)}`;
      } else if (mode === "months") {
        const normalizedYear = Number(year);
        if (!Number.isInteger(normalizedYear) || normalizedYear < 2000 || normalizedYear > 2100) {
          throw new Error("Informe um ano válido (2000 a 2100)");
        }
        if (months.length === 0) {
          throw new Error("Selecione ao menos um mês");
        }
        const separator = path.includes("?") ? "&" : "?";
        fullPath = `${path}${separator}year=${encodeURIComponent(String(normalizedYear))}&months=${encodeURIComponent(months.join(","))}`;
      }
      await downloadFile(fullPath, filename);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 16, paddingBottom: 16 }}>
      <h2 className="page-title">Relatórios</h2>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="grid two">
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Downloads</h3>
          <p className="small" style={{ marginTop: 0 }}>Exporte relatórios do estoque e do histórico.</p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button className={mode === "date" ? "" : "secondary"} onClick={() => setMode("date")}>Por datas</button>
            <button className={mode === "months" ? "" : "secondary"} onClick={() => setMode("months")}>Por meses</button>
          </div>

          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            {mode === "date" ? (
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
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ maxWidth: 180 }}>
                  <label style={{ display: "block", fontSize: "12px", color: "var(--muted)", marginBottom: 4 }}>Ano</label>
                  <input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(e.target.value)} />
                </div>
                <label style={{ display: "block", fontSize: "12px", color: "var(--muted)" }}>Seleção rápida</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="secondary" onClick={() => setMonthsPreset([1, 2, 3])}>T1</button>
                  <button type="button" className="secondary" onClick={() => setMonthsPreset([4, 5, 6])}>T2</button>
                  <button type="button" className="secondary" onClick={() => setMonthsPreset([7, 8, 9])}>T3</button>
                  <button type="button" className="secondary" onClick={() => setMonthsPreset([10, 11, 12])}>T4</button>
                  <button type="button" className="secondary" onClick={() => setMonthsPreset([1, 2, 3, 4, 5, 6])}>S1</button>
                  <button type="button" className="secondary" onClick={() => setMonthsPreset([7, 8, 9, 10, 11, 12])}>S2</button>
                  <button type="button" className="secondary" onClick={() => setMonthsPreset([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])}>Ano</button>
                  <button type="button" className="secondary" onClick={() => setMonths([])}>Limpar</button>
                </div>
                <label style={{ display: "block", fontSize: "12px", color: "var(--muted)" }}>Meses</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
                  {MONTH_OPTIONS.map((m) => {
                    const active = months.includes(m.value);
                    return (
                      <button
                        key={m.value}
                        type="button"
                        className={active ? "" : "secondary"}
                        onClick={() => toggleMonth(m.value)}
                        style={{
                          justifyContent: "flex-start",
                          border: active ? "1px solid rgba(70,194,255,0.6)" : undefined,
                          background: active
                            ? "linear-gradient(90deg, rgba(70,194,255,0.22), rgba(79,70,229,0.22))"
                            : undefined
                        }}
                      >
                        {active ? "✓ " : ""}{m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {mode === "date" && dates.startDate && dates.endDate && (
              <div className="small" style={{ color: "var(--accent)" }}>
                Filtrado de {formatDateBR(dates.startDate)} a {formatDateBR(dates.endDate)}
              </div>
            )}
            {mode === "months" && months.length > 0 && (
              <div className="small" style={{ color: "var(--accent)" }}>
                Consolidado mensal por produto: {months.length} mês(es) selecionado(s)
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
          <h3 style={{ marginTop: 0 }}>Resumo</h3>
          <p className="small" style={{ marginTop: 0 }}>
            No modo <b>Por meses</b>, os relatórios de estoque, entradas e saídas saem consolidados por produto.
          </p>
          <p className="small" style={{ marginTop: 0 }}>
            Exemplo: selecionando Janeiro, Fevereiro e Março, o PDF mostra a soma total movimentada nesses meses.
          </p>
          <p className="small" style={{ marginBottom: 0 }}>
            Use isso para análise trimestral, semestral ou anual sem detalhamento diário.
          </p>
        </div>
      </div>
    </div>
  );
}
