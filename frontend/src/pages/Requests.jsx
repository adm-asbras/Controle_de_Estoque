import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { auth } from "../auth";
import { SECTORS } from "../constants/inventory";

function getTodayLocalInputValue() {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

function formatDateBR(date) {
  return new Date(date).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatDateTimeBR(date) {
  return new Date(date).toLocaleString("pt-BR");
}

function typeLabel(type) {
  return type === "restock" ? "Reposição" : "Retirada";
}

function statusLabel(status) {
  if (status === "pending") return "Pendente";
  if (status === "approved") return "Aprovada";
  if (status === "rejected") return "Rejeitada";
  return status;
}

function statusBadgeClass(status) {
  if (status === "approved") return "badge ok";
  if (status === "rejected") return "badge danger";
  return "badge warn";
}

function isUnreadResponse(requestItem) {
  return (
    !!requestItem &&
    (requestItem.status === "approved" || requestItem.status === "rejected") &&
    !!requestItem.reviewedAt &&
    !requestItem.responseSeenAt
  );
}

const UNREAD_RESPONSES_VISIBLE_ROWS = 10;
const UNREAD_RESPONSE_ROW_PX = 30;
const UNREAD_RESPONSE_ROW_GAP_PX = 6;
const HISTORY_VISIBLE_ROWS = 10;
const HISTORY_ROW_PX = 39;
const HISTORY_HEADER_PX = 43;
const REQUESTS_POLL_MS_USER = 3000;
const REQUESTS_POLL_MS_ADMIN = 3000;

// Tela de solicitações com aprovação administrativa.
export default function RequestsPage() {
  const role = auth.getRole();
  const isAdmin = role === "admin" || role === "admin_limited";

  const [products, setProducts] = useState([]);
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewNotes, setReviewNotes] = useState({});
  const [unreadResponsesCount, setUnreadResponsesCount] = useState(0);
  const [unreadResponses, setUnreadResponses] = useState([]);
  const [markingResponseId, setMarkingResponseId] = useState("");
  const [flashRequestId, setFlashRequestId] = useState("");
  const [submitState, setSubmitState] = useState("idle");
  const [submitFeedback, setSubmitFeedback] = useState("");
  const [error, setError] = useState("");
  const submitFeedbackTimerRef = useRef(null);
  const [sector, setSector] = useState(SECTORS[0]);
  const [form, setForm] = useState({
    type: "exit",
    productId: "",
    qty: 1,
    date: getTodayLocalInputValue(),
    observation: ""
  });

  const filteredProducts = useMemo(
    () => products.filter((p) => p.sector === sector),
    [products, sector]
  );

  const selectedProduct = useMemo(
    () => filteredProducts.find((p) => p._id === form.productId) || null,
    [filteredProducts, form.productId]
  );
  const unreadListShouldScroll = unreadResponses.length > UNREAD_RESPONSES_VISIBLE_ROWS;
  const unreadListMaxHeightPx =
    (UNREAD_RESPONSES_VISIBLE_ROWS * UNREAD_RESPONSE_ROW_PX) +
    ((UNREAD_RESPONSES_VISIBLE_ROWS - 1) * UNREAD_RESPONSE_ROW_GAP_PX);
  const historyShouldScroll = requests.length > HISTORY_VISIBLE_ROWS;
  const historyMaxHeightPx = HISTORY_HEADER_PX + (HISTORY_VISIBLE_ROWS * HISTORY_ROW_PX);

  async function load(nextStatusFilter = statusFilter, options = {}) {
    const silent = !!options.silent;
    if (!silent) setError("");
    try {
      const queryStatus = nextStatusFilter === "all" ? "" : nextStatusFilter;

      let allProducts = [];
      let list = [];
      let unreadCount = 0;
      let unreadItems = [];

      if (isAdmin) {
        [allProducts, list] = await Promise.all([
          api.listProducts(),
          api.listRequests(queryStatus)
        ]);
      } else {
        const unreadDataPromise = api.getUnreadRequestResponsesCount();
        [allProducts, list] = await Promise.all([
          api.listProducts(),
          api.listRequests(queryStatus)
        ]);
        const unreadData = await unreadDataPromise;

        unreadCount = Number(unreadData?.count || 0);
        if (unreadCount > 0) {
          const sourceRequests =
            nextStatusFilter === "all"
              ? list
              : await api.listRequests("");

          unreadItems = Array.isArray(sourceRequests)
            ? sourceRequests
                .filter(isUnreadResponse)
                .sort((a, b) => {
                  const dateA = new Date(a.reviewedAt || a.updatedAt || a.createdAt).getTime();
                  const dateB = new Date(b.reviewedAt || b.updatedAt || b.createdAt).getTime();
                  return dateB - dateA;
                })
            : [];
        }
      }

      setProducts(allProducts);
      setRequests(list);
      setUnreadResponsesCount(unreadCount);
      setUnreadResponses(unreadItems);
      setSector((current) => {
        if (allProducts.some((p) => p.sector === current)) return current;
        return allProducts[0]?.sector || SECTORS[0];
      });
    } catch (err) {
      if (!silent) setError(err.message);
    }
  }

  useEffect(() => {
    load(statusFilter);
  }, [statusFilter]);

  // Atualiza automaticamente a lista para nao depender de refresh manual.
  useEffect(() => {
    let active = true;
    let timer = null;
    const pollMs = isAdmin ? REQUESTS_POLL_MS_ADMIN : REQUESTS_POLL_MS_USER;

    async function scheduleRefresh() {
      if (!active) return;
      await load(statusFilter, { silent: true });
      if (!active) return;
      timer = window.setTimeout(scheduleRefresh, pollMs);
    }

    timer = window.setTimeout(scheduleRefresh, pollMs);

    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [isAdmin, statusFilter]);

  useEffect(() => {
    setForm((current) => {
      if (!filteredProducts.length) {
        if (!current.productId) return current;
        return { ...current, productId: "" };
      }
      if (filteredProducts.some((p) => p._id === current.productId)) return current;
      return { ...current, productId: filteredProducts[0]._id };
    });
  }, [filteredProducts]);

  useEffect(() => {
    return () => {
      if (submitFeedbackTimerRef.current) {
        window.clearTimeout(submitFeedbackTimerRef.current);
      }
    };
  }, []);

  async function createRequest(e) {
    e.preventDefault();
    if (submitState === "sending") return;
    setError("");
    if (!form.productId) {
      setError("Selecione um produto para enviar a solicitação.");
      return;
    }

    setSubmitState("sending");
    setSubmitFeedback("");

    try {
      await api.createRequest({
        type: form.type,
        productId: form.productId,
        qty: Number(form.qty),
        date: form.date,
        observation: form.observation
      });
      setForm((current) => ({
        ...current,
        qty: 1,
        observation: "",
        date: getTodayLocalInputValue()
      }));
      await load(statusFilter);
      setSubmitState("success");
      setSubmitFeedback("Solicitação enviada com sucesso.");

      if (submitFeedbackTimerRef.current) {
        window.clearTimeout(submitFeedbackTimerRef.current);
      }
      submitFeedbackTimerRef.current = window.setTimeout(() => {
        setSubmitState("idle");
        setSubmitFeedback("");
      }, 1600);
    } catch (err) {
      setSubmitState("idle");
      setError(err.message);
    }
  }

  async function markResponsesAsSeen() {
    if (isAdmin || unreadResponsesCount === 0) return;
    setError("");
    try {
      await api.markUnreadRequestResponsesSeen();
      await load(statusFilter);
      window.dispatchEvent(new Event("requests-alert-updated"));
    } catch (err) {
      setError(err.message);
    }
  }

  async function reviewRequest(requestId, decision) {
    setError("");
    try {
      const reviewNote = reviewNotes[requestId] || "";
      await api.reviewRequest(requestId, { decision, reviewNote });
      setReviewNotes((current) => ({ ...current, [requestId]: "" }));
      await load(statusFilter);
    } catch (err) {
      setError(err.message);
    }
  }

  function focusRequestInHistory(requestId) {
    if (!requestId) return;

    setStatusFilter("all");

    window.setTimeout(() => {
      const row = document.getElementById(`request-row-${requestId}`);
      if (!row) return;

      row.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashRequestId(requestId);
      window.setTimeout(() => {
        setFlashRequestId((current) => (current === requestId ? "" : current));
      }, 1200);
    }, 120);
  }

  async function handleUnreadResponseClick(requestId) {
    focusRequestInHistory(requestId);
    if (isAdmin || !requestId || markingResponseId === requestId) return;

    setError("");
    setMarkingResponseId(requestId);
    try {
      const result = await api.markRequestResponseSeen(requestId);
      if (Number(result?.updated || 0) > 0) {
        const seenAt = new Date().toISOString();
        setUnreadResponses((current) => current.filter((item) => item._id !== requestId));
        setUnreadResponsesCount((current) => Math.max(0, current - 1));
        setRequests((current) => current.map((item) => (
          item._id === requestId ? { ...item, responseSeenAt: seenAt } : item
        )));
        window.dispatchEvent(new Event("requests-alert-updated"));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setMarkingResponseId((current) => (current === requestId ? "" : current));
    }
  }

  return (
    <div className="container" style={{ paddingTop: 16, paddingBottom: 16 }}>
      <h2 className="page-title">Solicitações</h2>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {!isAdmin && unreadResponsesCount > 0 && (
        <div className="card" style={{ padding: 12, marginBottom: 12, borderLeft: "4px solid var(--danger)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              <b>Você tem {unreadResponsesCount} solicitação(ões) respondida(s).</b>
              <div className="small">Seu pedido foi analisado. Veja abaixo quais pedidos tiveram resposta.</div>
            </div>
            <button type="button" className="secondary" onClick={markResponsesAsSeen}>
              Marcar como lidas
            </button>
          </div>

          {unreadResponses.length > 0 && (
            <div
              className="request-unread-list"
              style={{
                marginTop: 10,
                display: "grid",
                gap: UNREAD_RESPONSE_ROW_GAP_PX,
                maxHeight: unreadListShouldScroll ? `${unreadListMaxHeightPx}px` : "none",
                overflowY: unreadListShouldScroll ? "auto" : "visible"
              }}
            >
              {unreadResponses.map((requestItem) => (
                <button
                  key={requestItem._id}
                  type="button"
                  className="request-response-item small"
                  onClick={() => handleUnreadResponseClick(requestItem._id)}
                  disabled={markingResponseId === requestItem._id}
                  title="Ir para o histórico e marcar como lida"
                >
                  <span className={statusBadgeClass(requestItem.status)}>{statusLabel(requestItem.status)}</span>
                  <b>{requestItem.product?.name || "Produto removido"}</b>
                  <span>Qtd: {requestItem.qty}</span>
                  <span>Respondida em: {formatDateTimeBR(requestItem.reviewedAt || requestItem.updatedAt || requestItem.createdAt)}</span>
                  {markingResponseId === requestItem._id ? <span className="small">Marcando como lida...</span> : null}
                </button>
              ))}

              {unreadResponses.length > UNREAD_RESPONSES_VISIBLE_ROWS && (
                <div className="small">Mostrando até {UNREAD_RESPONSES_VISIBLE_ROWS} por vez. Role para ver as demais.</div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid two">
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Nova solicitação</h3>
          <form onSubmit={createRequest} style={{ display: "grid", gap: 10 }}>
            <select value={form.type} onChange={(e) => setForm((current) => ({ ...current, type: e.target.value }))}>
              <option value="exit">Retirada</option>
              <option value="restock">Reposição</option>
            </select>

            <select value={sector} onChange={(e) => setSector(e.target.value)}>
              {SECTORS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={form.productId}
              onChange={(e) => setForm((current) => ({ ...current, productId: e.target.value }))}
              disabled={filteredProducts.length === 0}
            >
              {filteredProducts.length === 0 ? (
                <option value="">Nenhum produto nesta categoria</option>
              ) : (
                filteredProducts.map((product) => (
                  <option key={product._id} value={product._id}>
                    {form.type === "exit" ? `${product.name} (disp: ${product.qty})` : product.name}
                  </option>
                ))
              )}
            </select>

            {selectedProduct && form.type === "exit" && (
              <div className="small">
                Mínimo: {selectedProduct.minQty}
                {selectedProduct.unit} | Atual: {selectedProduct.qty}
                {selectedProduct.unit}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div className="small" style={{ marginBottom: 4 }}>Quantidade</div>
                <input
                  type="number"
                  min="1"
                  value={form.qty}
                  onChange={(e) => setForm((current) => ({ ...current, qty: e.target.value }))}
                />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div className="small" style={{ marginBottom: 4 }}>Data de referência</div>
                <input type="date" value={form.date} onChange={(e) => setForm((current) => ({ ...current, date: e.target.value }))} />
              </div>
            </div>

            <textarea
              rows={3}
              placeholder="Observação (opcional)"
              value={form.observation}
              onChange={(e) => setForm((current) => ({ ...current, observation: e.target.value }))}
            />
            <button
              className={`request-submit-btn${submitState === "success" ? " success" : ""}`}
              disabled={!form.productId || submitState === "sending"}
            >
              {submitState === "sending" ? "Enviando..." : submitState === "success" ? "Enviado!" : "Enviar solicitação"}
            </button>
            {submitFeedback ? <div className="small request-submit-feedback">{submitFeedback}</div> : null}
          </form>
        </div>

        <div className="card" style={{ padding: 16 }}>
          {form.type === "exit" && (
            <div style={{ marginBottom: 14 }}>
              <h3 style={{ marginTop: 0 }}>Estoque atual - {sector}</h3>
              {filteredProducts.length === 0 ? (
                <p className="small">Nenhum produto cadastrado nesta categoria.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr><th>Produto</th><th>Unidade</th><th>Qtd</th><th>Min</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => (
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
          )}

          <h3 style={{ marginTop: 0 }}>Visão geral</h3>
          <div className="small" style={{ marginBottom: 8 }}>
            {isAdmin ? "Você pode aprovar/rejeitar solicitações pendentes." : "Acompanhe aqui o status das suas solicitações."}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className={statusFilter === "all" ? "" : "secondary"} onClick={() => setStatusFilter("all")}>Todas</button>
            <button className={statusFilter === "pending" ? "" : "secondary"} onClick={() => setStatusFilter("pending")}>Pendentes</button>
            <button className={statusFilter === "approved" ? "" : "secondary"} onClick={() => setStatusFilter("approved")}>Aprovadas</button>
            <button className={statusFilter === "rejected" ? "" : "secondary"} onClick={() => setStatusFilter("rejected")}>Rejeitadas</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>Histórico de solicitações</h3>
        <div
          className="request-history-scroll"
          style={{
            maxHeight: historyShouldScroll ? `${historyMaxHeightPx}px` : "none",
            overflowY: historyShouldScroll ? "auto" : "visible",
            overflowX: "hidden"
          }}
        >
          <table className="table request-history-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Produto</th>
                <th>Qtd</th>
                <th>Solicitante</th>
                <th>Observação</th>
                <th>Status</th>
                <th>Avaliação</th>
                {isAdmin && <th>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map((requestItem) => {
                const unreadResponse = !isAdmin && isUnreadResponse(requestItem);
                const shouldFlash = flashRequestId === requestItem._id;

                return (
                  <tr
                    key={requestItem._id}
                    id={`request-row-${requestItem._id}`}
                    className={shouldFlash ? "request-row-flash" : ""}
                    style={unreadResponse ? { background: "rgba(255, 77, 109, 0.08)" } : undefined}
                  >
                    <td>{formatDateBR(requestItem.requestDate || requestItem.createdAt)}</td>
                    <td><span className="badge">{typeLabel(requestItem.type)}</span></td>
                    <td>{requestItem.product?.name || "-"}</td>
                    <td>{requestItem.qty}</td>
                    <td>{requestItem.requestedBy}</td>
                    <td>
                      {requestItem.observation ? (
                        <span className="small">{requestItem.observation}</span>
                      ) : (
                        <span className="small">-</span>
                      )}
                    </td>
                    <td><span className={statusBadgeClass(requestItem.status)}>{statusLabel(requestItem.status)}</span></td>
                    <td>
                      {requestItem.reviewedBy ? (
                        <div className="small" style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span>
                            {requestItem.reviewedBy}
                            {requestItem.reviewNote ? ` - ${requestItem.reviewNote}` : ""}
                          </span>
                          {unreadResponse ? <span className="badge danger">NOVA RESPOSTA</span> : null}
                        </div>
                      ) : (
                        <span className="small">-</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td style={{ minWidth: 220 }}>
                        {requestItem.status === "pending" ? (
                          <div style={{ display: "grid", gap: 8 }}>
                            <input
                              placeholder="Nota da avaliação (opcional)"
                              value={reviewNotes[requestItem._id] || ""}
                              onChange={(e) => setReviewNotes((current) => ({ ...current, [requestItem._id]: e.target.value }))}
                            />
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button onClick={() => reviewRequest(requestItem._id, "approve")}>Aprovar</button>
                              <button className="secondary" onClick={() => reviewRequest(requestItem._id, "reject")}>Rejeitar</button>
                            </div>
                          </div>
                        ) : (
                          <span className="small">Finalizada</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className="small">Nenhuma solicitação encontrada para o filtro atual.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
