// /api/admin/* — solo para el panel (requiere haber ingresado con Netlify Identity).
//   GET  /api/admin/pedidos                 lista de compras
//   GET  /api/admin/comprobante?codigo=…    archivo del comprobante
//   POST /api/admin/estado {codigo, estado} cambia el estado (aprobar, enviado, cancelar…)
//   GET  /api/admin/suscriptores            lista de novedades
import { pedidos, comprobantes, suscriptores, json, usuarioPanel } from "../lib/comun.mjs";

export const config = { path: "/api/admin/*" };
const ESTADOS = ["esperando-pago", "comprobante-recibido", "aprobado", "pagado", "enviado", "cancelado"];

async function todos(store) {
  const { blobs } = await store.list();
  const items = await Promise.all(blobs.map(b => store.get(b.key, { type: "json" })));
  return items.filter(Boolean);
}

export default async (req) => {
  const usuario = await usuarioPanel(req);
  if (!usuario) return json({ error: "Tenés que ingresar al panel." }, 401);
  const url = new URL(req.url);
  const accion = url.pathname.replace(/^\/api\/admin\/?/, "");

  if (req.method === "GET" && accion === "pedidos") {
    const lista = (await todos(pedidos())).sort((a, b) => b.fecha.localeCompare(a.fecha));
    return json({ pedidos: lista });
  }
  if (req.method === "GET" && accion === "comprobante") {
    const codigo = url.searchParams.get("codigo") || "";
    const r = await comprobantes().getWithMetadata(codigo, { type: "arrayBuffer" });
    if (!r) return json({ error: "Sin comprobante" }, 404);
    return new Response(r.data, { headers: { "Content-Type": (r.metadata && r.metadata.tipo) || "application/octet-stream", "Cache-Control": "private, no-store" } });
  }
  if (req.method === "POST" && accion === "estado") {
    const { codigo, estado } = await req.json();
    if (!ESTADOS.includes(estado)) return json({ error: "Estado inválido" }, 400);
    const store = pedidos(), p = await store.get(codigo, { type: "json" });
    if (!p) return json({ error: "No existe ese pedido" }, 404);
    p.estado = estado;
    p.historial = (p.historial || []).concat({ estado, fecha: new Date().toISOString(), por: usuario.email });
    await store.setJSON(codigo, p);
    return json({ ok: true, pedido: p });
  }
  if (req.method === "GET" && accion === "suscriptores") {
    const lista = (await todos(suscriptores())).sort((a, b) => b.fecha.localeCompare(a.fecha));
    return json({ suscriptores: lista });
  }
  return json({ error: "No encontrado" }, 404);
};
