import { useEffect, useState } from "react";
import { api } from "../api";

// Retorna data local em formato compativel com input date.
function getTodayLocalInputValue() {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

// Formata datas de saida para exibicao pt-BR.
function formatDateBR(date) {
  return new Date(date).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// Tela administrativa para lancar entradas de estoque.
export default function AdminEntries() {
  const [products, setProducts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    productId: "",
    qty: 1,
    date: getTodayLocalInputValue()
  });

  // Carrega produtos e historico de entradas em paralelo.
  async function load() {
    setError("");
    try {
      const [p, e] = await Promise.all([api.listProducts(), api.listEntries()]);
      setProducts(p);
      setEntries(e);
      if (!form.productId && p.length) setForm((f) => ({ ...f, productId: p[0]._id }));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  // Salva nova entrada e recarrega dados.
  async function create(e) {
    e.preventDefault();
    setError("");
    try {
      await api.createEntry({
        productId: form.productId,
        qty: Number(form.qty),
        date: form.date
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container" style={{ padding: "16px 0" }}>
      <h2 className="page-title">Entradas</h2>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="grid two">
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Lançar entrada</h3>
          <form onSubmit={create} style={{ display: "grid", gap: 10 }}>
            <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
              {products.map((p) => <option key={p._id} value={p._id}>{p.name} ({p.sector})</option>)}
            </select>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "120px" }}>
                <div className="small" style={{ marginBottom: "4px" }}>Quantidade</div>
                <input type="number" min="1" placeholder="0" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
              </div>
              <div style={{ flex: 1, minWidth: "120px" }}>
                <div className="small" style={{ marginBottom: "4px" }}>Data</div>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>

            <button>Lançar entrada</button>
            <div className="small">Entradas incrementam o estoque automaticamente.</div>
          </form>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Dica</h3>
          <p className="small" style={{ marginTop: 0 }}>
            Registre a entrada na data correta e confira a categoria do item para manter o relatório organizado.
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>Histórico de entradas</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Produto</th>
              <th>Categoria</th>
              <th>Unidade</th>
              <th>Quantidade</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
