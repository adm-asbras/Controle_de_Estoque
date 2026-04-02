import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { SECTORS, UNITS } from "../constants/inventory";

const PATCH_DEBOUNCE_MS = 450;

function formatDateBR(date) {
  return new Date(date).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function historyTypeLabel(type) {
  if (type === "entrada") return "Entrada";
  if (type === "saida") return "Saída";
  if (type === "solicitacao") return "Solicitação";
  return type;
}

function historyStatusLabel(status) {
  if (status === "pending") return "Pendente";
  if (status === "approved") return "Aprovada";
  if (status === "rejected") return "Rejeitada";
  if (status === "completed") return "Concluída";
  if (status === "cancelled") return "Cancelada";
  return status;
}

// Tela administrativa de cadastro e manutencao de produtos.
export default function AdminProducts() {
  const [items, setItems] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [historyProductId, setHistoryProductId] = useState("");
  const [historyEvents, setHistoryEvents] = useState([]);
  const [historyProductName, setHistoryProductName] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    sector: SECTORS[0],
    unit: UNITS[0],
    minQty: 0
  });
  const [error, setError] = useState("");
  const patchTimersRef = useRef(new Map());

  async function load() {
    setError("");
    try {
      setItems(await api.listProducts());
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadRecommendations() {
    try {
      const data = await api.listProductRecommendations({ horizonDays: 60, coverageDays: 30 });
      setRecommendations(data.items || []);
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadProductHistory(product) {
    setHistoryLoading(true);
    setError("");
    try {
      const data = await api.getProductHistory(product._id);
      setHistoryProductId(product._id);
      setHistoryProductName(product.name);
      setHistoryEvents(data.events || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadRecommendations();
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of patchTimersRef.current.values()) {
        clearTimeout(timer);
      }
      patchTimersRef.current.clear();
    };
  }, []);

  async function create(e) {
    e.preventDefault();
    setError("");
    try {
      await api.createProduct({
        name: form.name,
        sector: form.sector,
        unit: form.unit,
        minQty: Number(form.minQty)
      });
      setForm({ name: "", sector: SECTORS[0], unit: UNITS[0], minQty: 0 });
      await load();
      await loadRecommendations();
    } catch (e) {
      setError(e.message);
    }
  }

  function patch(id, field, value) {
    setError("");
    setItems((current) => current.map((item) => (item._id === id ? { ...item, [field]: value } : item)));

    const key = `${id}:${field}`;
    const pendingTimer = patchTimersRef.current.get(key);
    if (pendingTimer) clearTimeout(pendingTimer);

    const timer = setTimeout(async () => {
      patchTimersRef.current.delete(key);
      try {
        const updated = await api.updateProduct(id, { [field]: value });
        setItems((current) => current.map((item) => (item._id === id ? updated : item)));
        loadRecommendations();
      } catch (e) {
        setError(e.message);
        await load();
        await loadRecommendations();
      }
    }, PATCH_DEBOUNCE_MS);

    patchTimersRef.current.set(key, timer);
  }

  async function remove(id) {
    setError("");
    try {
      for (const [key, timer] of patchTimersRef.current.entries()) {
        if (key.startsWith(`${id}:`)) {
          clearTimeout(timer);
          patchTimersRef.current.delete(key);
        }
      }
      await api.deleteProduct(id);
      await load();
      await loadRecommendations();
    } catch (e) {
      setError(e.message);
    }
  }

  const restockItems = items.filter((p) => p.needsRestock);
  const shouldLoopRestock = restockItems.length > 1;
  const restockTrackItems = shouldLoopRestock ? [...restockItems, ...restockItems] : restockItems;

  return (
    <div className="container" style={{ paddingTop: 16, paddingBottom: 16 }}>
      <style>{`
        @keyframes carouselScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .restock-carousel {
          animation: carouselScroll 45s linear infinite;
          will-change: transform;
        }
        .restock-carousel:hover {
          animation-play-state: paused;
        }
      `}</style>

      <h2 className="page-title">Produtos</h2>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="grid two">
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Cadastrar produto</h3>
          <form onSubmit={create} style={{ display: "grid", gap: 10 }}>
            <input
              placeholder="Nome do produto (ex.: Caneta)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <select value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}>
              {SECTORS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "150px", maxWidth: "260px" }}>
                <div className="small" style={{ marginBottom: 4 }}>
                  Qtd. mínima
                </div>
                <input
                  type="number"
                  placeholder="0"
                  value={form.minQty}
                  onChange={(e) => setForm({ ...form, minQty: e.target.value })}
                />
              </div>
            </div>

            <button>Criar</button>
            <div className="small">
              O sistema alerta automaticamente quando <b>Qtd {"<="} Mínimo</b>.
            </div>
          </form>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Exemplos de categoria</h3>
          <ul className="small" style={{ marginTop: 0, lineHeight: 1.7 }}>
            <li>
              <b>Caneta</b> - Escritório
            </li>
            <li>
              <b>Papel A4</b> - Expediente
            </li>
            <li>
              <b>Detergente</b> - Limpeza
            </li>
          </ul>
          <div className="small">
            <span className="badge ok">OK</span> acima do mínimo{" "}
            <span className="badge danger">REPOR</span> no mínimo/abaixo
          </div>
        </div>
      </div>

      {restockItems.length > 0 && (
        <div
          className="card"
          style={{
            padding: 16,
            marginTop: 14,
            borderLeft: "4px solid var(--danger)",
            overflow: "hidden"
          }}
        >
          <h3 style={{ marginTop: 0, color: "var(--danger)" }}>Produtos para repor</h3>

          <div style={{ overflow: "hidden", width: "100%" }}>
            <div
              className={shouldLoopRestock ? "restock-carousel" : ""}
              style={{
                display: "flex",
                gap: 12,
                width: "max-content"
              }}
            >
              {restockTrackItems.map((p, idx) => (
                <div
                  key={`${p._id}-${idx}`}
                  style={{
                    padding: 12,
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderLeft: "3px solid var(--danger)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    minWidth: "min(280px, 86vw)",
                    flexShrink: 0
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>{p.name}</div>
                    <div className="small" style={{ marginBottom: 4 }}>
                      {p.sector} - {p.unit}
                    </div>
                    <div className="small">
                      <span style={{ color: "var(--danger)" }}>
                        Qtd: {p.qty}
                        {p.unit}
                      </span>{" "}
                      / Min: {p.minQty}
                      {p.unit}
                    </div>
                  </div>
                  <span className="badge danger">REPOR</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 16, marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>Produtos cadastrados</h3>
        <div className="products-table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Unidade</th>
                <th>Quantidade</th>
                <th>Mínimo</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>

            <tbody>
              {items.map((p) => (
                <tr key={p._id}>
                  <td>
                    <input value={p.name} onChange={(e) => patch(p._id, "name", e.target.value)} />
                  </td>

                  <td>
                    <select value={p.sector} onChange={(e) => patch(p._id, "sector", e.target.value)}>
                      {SECTORS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td>
                    <select value={p.unit} onChange={(e) => patch(p._id, "unit", e.target.value)}>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td>
                    <input
                      type="number"
                      value={p.qty}
                      onChange={(e) => patch(p._id, "qty", Number(e.target.value))}
                    />
                  </td>

                  <td>
                    <input
                      type="number"
                      value={p.minQty}
                      onChange={(e) => patch(p._id, "minQty", Number(e.target.value))}
                    />
                  </td>

                  <td>{p.needsRestock ? <span className="badge danger">REPOR</span> : <span className="badge ok">OK</span>}</td>

                  <td>
                    <div style={{ display: "grid", gap: 8 }}>
                      <button className="secondary" onClick={() => loadProductHistory(p)}>
                        Histórico
                      </button>
                      <button className="secondary" onClick={() => remove(p._id)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Sugestão automática de reposição</h3>
          <button className="secondary" onClick={loadRecommendations}>Atualizar</button>
        </div>
        <div className="small" style={{ marginTop: 8, marginBottom: 10 }}>
          Janela de consumo: 60 dias | Cobertura alvo: 30 dias
        </div>
        <div className="products-table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Consumo médio/dia</th>
                <th>Dias até ruptura</th>
                <th>Sugerido</th>
                <th>Urgência</th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map((item) => (
                <tr key={item.productId}>
                  <td>{item.productName}</td>
                  <td><span className="badge">{item.sector}</span></td>
                  <td>{item.avgDailyConsumption}</td>
                  <td>{item.daysToStockout == null ? "-" : item.daysToStockout}</td>
                  <td>
                    <span className={item.suggestedQty > 0 ? "badge warn" : "badge"}>
                      {item.suggestedQty}
                      {item.unit}
                    </span>
                  </td>
                  <td>
                    <span className={item.urgency === "alta" ? "badge danger" : item.urgency === "media" ? "badge warn" : "badge ok"}>
                      {item.urgency}
                    </span>
                  </td>
                </tr>
              ))}
              {recommendations.length === 0 && (
                <tr>
                  <td colSpan={6} className="small">Nenhuma sugestão no momento.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>Histórico completo por item</h3>
        {historyProductId ? (
          <>
            <div className="small" style={{ marginBottom: 10 }}>
              Produto selecionado: <b>{historyProductName}</b>
            </div>
            {historyLoading ? (
              <p className="small">Carregando histórico...</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Delta</th>
                      <th>Responsável</th>
                    <th>Status</th>
                    <th>Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {historyEvents.map((event) => (
                    <tr key={event.id}>
                      <td>{formatDateBR(event.date)}</td>
                      <td><span className="badge">{historyTypeLabel(event.type)}</span></td>
                      <td>
                        <span className={event.qtyDelta < 0 ? "badge warn" : event.qtyDelta > 0 ? "badge ok" : "badge"}>
                          {event.qtyDelta > 0 ? `+${event.qtyDelta}` : event.qtyDelta}
                        </span>
                      </td>
                      <td>{event.actor || "-"}</td>
                      <td>
                        {event.status ? <span className="badge">{historyStatusLabel(event.status)}</span> : "-"}
                      </td>
                      <td>{event.details}</td>
                    </tr>
                  ))}
                  {historyEvents.length === 0 && (
                    <tr>
                      <td colSpan={6} className="small">Sem eventos para este item.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <p className="small">Clique em "Histórico" no produto para carregar a linha do tempo.</p>
        )}
      </div>
    </div>
  );
}
