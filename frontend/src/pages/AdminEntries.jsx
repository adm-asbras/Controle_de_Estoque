import { useEffect, useState } from "react";
import { api } from "../api";

const SECTORS = ["Expediente", "Escritorio", "Limpeza", "Copa"];

function getTodayLocalInputValue() {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

function formatDateBR(date) {
  return new Date(date).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default function AdminEntries() {
  const [products, setProducts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    sector: "Expediente",
    productId: "",
    qty: 1,
    date: getTodayLocalInputValue()
  });

  async function load(selectedSector = form.sector) {
    setError("");
    try {
      const [p, e] = await Promise.all([api.listProducts(selectedSector), api.listEntries()]);
      setProducts(p);
      setEntries(e);
      setForm((f) => {
        const keepSelected = p.some((item) => item._id === f.productId);
        return {
          ...f,
          sector: selectedSector,
          productId: keepSelected ? f.productId : (p[0]?._id || "")
        };
      });
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load(form.sector);
  }, [form.sector]);

  async function create(e) {
    e.preventDefault();
    setError("");
    try {
      await api.createEntry({
        productId: form.productId,
        qty: Number(form.qty),
        date: form.date
      });
      await load(form.sector);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 16, paddingBottom: 16 }}>
      <h2 className="page-title">Entradas</h2>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="grid two">
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Lancar entrada</h3>
          <form onSubmit={create} style={{ display: "grid", gap: 10 }}>
            <select value={form.sector} onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value, productId: "" }))}>
              {SECTORS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}>
              {products.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} ({p.sector})
                </option>
              ))}
            </select>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "120px" }}>
                <div className="small" style={{ marginBottom: "4px" }}>Quantidade</div>
                <input
                  type="number"
                  min="1"
                  placeholder="0"
                  value={form.qty}
                  onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                />
              </div>
              <div style={{ flex: 1, minWidth: "120px" }}>
                <div className="small" style={{ marginBottom: "4px" }}>Data</div>
                <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
            </div>

            <button>Lancar entrada</button>
            <div className="small">Entradas incrementam o estoque automaticamente.</div>
          </form>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Dica</h3>
          <p className="small" style={{ marginTop: 0 }}>
            Selecione a categoria para facilitar a escolha do produto e manter o lancamento organizado.
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>Historico de entradas</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Produto</th>
              <th>Categoria</th>
              <th>Unidade</th>
              <th>Quantidade</th>
              <th>Lancado por</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((en) => (
              <tr key={en._id}>
                <td>{formatDateBR(en.date)}</td>
                <td>{en.product?.name}</td>
                <td><span className="badge">{en.product?.sector}</span></td>
                <td><span className="badge">{en.product?.unit}</span></td>
                <td><span className="badge ok">+{en.qty}</span></td>
                <td>{en.createdBy || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
