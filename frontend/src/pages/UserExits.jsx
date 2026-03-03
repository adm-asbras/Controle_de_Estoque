import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { auth } from "../auth";

const SECTORS = ["Expediente", "Escritorio", "Limpeza", "Copa"];

// Retorna data local em formato compativel com input date.
function getTodayLocalInputValue() {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

// Formata datas para exibicao no historico.
function formatDateBR(date) {
  return new Date(date).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// Tela de registro de saidas para usuario autenticado.
export default function UserExits() {
  const [sector, setSector] = useState("Expediente");
  const [products, setProducts] = useState([]);
  const [exits, setExits] = useState([]);
  const [error, setError] = useState("");
  const username = auth.getUsername() || "-";

  const [form, setForm] = useState({
    productId: "",
    qty: 1,
    observation: "",
    date: getTodayLocalInputValue()
  });

  const selectedProduct = useMemo(
    () => products.find((p) => p._id === form.productId),
    [products, form.productId]
  );

  // Carrega produtos do setor selecionado e historico de saidas.
  async function load(selectedSector = sector) {
    setError("");
    try {
      const [p, s] = await Promise.all([api.listProducts(selectedSector), api.listExits()]);
      setProducts(p);
      setExits(s);

      if (!form.productId && p.length) setForm((f) => ({ ...f, productId: p[0]._id }));
      if (form.productId && p.length && !p.some((x) => x._id === form.productId)) setForm((f) => ({ ...f, productId: p[0]._id }));
      if (!p.length) setForm((f) => ({ ...f, productId: "" }));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(sector); }, [sector]);

  // Cria saida com dados do formulario e atualiza tela.
  async function create(e) {
    e.preventDefault();
    setError("");
    try {
      await api.createExit({
        productId: form.productId,
        qty: Number(form.qty),
        observation: form.observation,
        date: form.date
      });
      setForm((f) => ({ ...f, qty: 1, observation: "" }));
      await load(sector);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container" style={{ padding: "16px 0" }}>
      <h2 className="page-title">• Saídas</h2>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="small">Categoria</div>
            <select value={sector} onChange={(e) => setSector(e.target.value)}>
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {selectedProduct && (
            <div style={{ textAlign: "right" }}>
              <div className="small">Selecionado</div>
              <div style={{ fontWeight: 800 }}>{selectedProduct.name} - {selectedProduct.qty} {selectedProduct.unit} em estoque</div>
              <div className="small">
                Minimo: {selectedProduct.minQty}{" "}
                {selectedProduct.needsRestock ? <span className="badge danger">REPOR</span> : <span className="badge ok">OK</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid two">
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Registrar saida</h3>
          <form onSubmit={create} style={{ display: "grid", gap: 10 }}>
            <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} disabled={products.length === 0}>
              {products.map((p) => <option key={p._id} value={p._id}>{p.name} (disp: {p.qty})</option>)}
            </select>

            <div className="small">Retirado por: <b>{username}</b></div>

            <textarea
              placeholder="Observacao (opcional)"
              value={form.observation}
              onChange={(e) => setForm({ ...form, observation: e.target.value })}
              rows={3}
            />

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

            <button disabled={products.length === 0 || !form.productId}>Confirmar saida</button>
            <div className="small">Ao registrar, o estoque e atualizado automaticamente.</div>
          </form>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Estoque atual - {sector}</h3>
          {products.length === 0 ? (
            <p className="small">Nenhum produto cadastrado neste setor.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Produto</th><th>Unidade</th><th>Qtd</th><th>Min</th><th>Status</th></tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p._id}>
                    <td>{p.name}</td>
                    <td>{p.unit}</td>
                    <td>{p.qty}</td>
                    <td>{p.minQty}</td>
                    <td>{p.needsRestock ? <span className="badge danger">REPOR</span> : <span className="badge ok">OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>Historico de saidas</h3>
        <table className="table">
          <thead>
            <tr><th>Data</th><th>Produto</th><th>Unidade</th><th>Setor</th><th>Qtd</th><th>Retirou</th><th>Observacao</th></tr>
          </thead>
          <tbody>
            {exits.map((ex) => (
              <tr key={ex._id}>
                <td>{formatDateBR(ex.date)}</td>
                <td>{ex.product?.name}</td>
                <td>{ex.product?.unit}</td>
                <td><span className="badge">{ex.product?.sector}</span></td>
                <td><span className="badge warn">-{ex.qty}</span></td>
                <td>{ex.takenBy}</td>
                <td>{ex.observation || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
