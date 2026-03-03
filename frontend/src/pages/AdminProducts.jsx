import { useEffect, useState } from "react";
import { api } from "../api";

const SECTORS = ["Expediente", "Escritorio", "Limpeza", "Copa"];
const UNITS = ["Un", "Pct", "Ltr", "Cx"];

// Tela administrativa de cadastro e manutencao de produtos.
export default function AdminProducts() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    name: "",
    sector: "Expediente",
    unit: "Un",
    minQty: 0,
    qty: 0
  });
  const [error, setError] = useState("");

  // Carrega lista de produtos para a tabela.
  async function load() {
    setError("");
    try {
      setItems(await api.listProducts());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Cria novo produto com dados do formulario.
  async function create(e) {
    e.preventDefault();
    setError("");
    try {
      await api.createProduct({
        name: form.name,
        sector: form.sector,
        unit: form.unit,
        minQty: Number(form.minQty),
        qty: Number(form.qty)
      });
      setForm({ name: "", sector: "Expediente", unit: "Un", minQty: 0, qty: 0 });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  // Atualiza campo isolado de um produto.
  async function patch(id, field, value) {
    setError("");
    try {
      await api.updateProduct(id, { [field]: value });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  // Remove produto pelo id.
  async function remove(id) {
    setError("");
    try {
      await api.deleteProduct(id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  const restockItems = items.filter((p) => p.needsRestock);
  const shouldLoopRestock = restockItems.length > 1;
  const restockTrackItems = shouldLoopRestock ? [...restockItems, ...restockItems] : restockItems;

  return (
    <div className="container" style={{ padding: "16px 0" }}>
      <style>{`
        @keyframes carouselScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .restock-carousel {
          animation: carouselScroll 28s linear infinite;
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
              <div style={{ flex: 1, minWidth: "150px" }}>
                <div className="small" style={{ marginBottom: 4 }}>
                  Qtd Mínima
                </div>
                <input
                  type="number"
                  placeholder="0"
                  value={form.minQty}
                  onChange={(e) => setForm({ ...form, minQty: e.target.value })}
                />
              </div>

              <div style={{ flex: 2, minWidth: "150px" }}>
                <div className="small" style={{ marginBottom: 4 }}>
                  Qtd Inicial
                </div>
                <input
                  type="number"
                  placeholder="0"
                  value={form.qty}
                  onChange={(e) => setForm({ ...form, qty: e.target.value })}
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
          <h3 style={{ marginTop: 0 }}>Exemplos de Categoria</h3>
          <ul className="small" style={{ marginTop: 0, lineHeight: 1.7 }}>
            <li>
              <b>Caneta</b> - Escritorio
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

      {/* Carrossel de produtos para repor */}
      {restockItems.length > 0 && (
        <div
          className="card"
          style={{
            padding: 16,
            marginTop: 14,
            borderLeft: "4px solid var(--danger)",
            overflow: "hidden" // impede vazar do card
          }}
        >
          <h3 style={{ marginTop: 0, color: "var(--danger)" }}>Produtos para Repor</h3>

          {/* área visível */}
          <div style={{ overflow: "hidden", width: "100%" }}>
            {/* trilho animado */}
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
                    minWidth: 280,
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
                  <button className="secondary" onClick={() => remove(p._id)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
