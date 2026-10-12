// POST /api/mp-webhook — Mercado Pago avisa acá cuando cambia un pago.
// Se consulta el pago directamente a Mercado Pago (no se confía en lo que llega en el aviso)
// y, si está aprobado, se marca el pedido como pagado y se avisa a la tienda por WhatsApp.
import { pedidos, json, precio, resumenPedido, avisarWhatsApp } from "../lib/comun.mjs";

export const config = { path: "/api/mp-webhook" };

export default async (req) => {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return json({ ok: true });
  const url = new URL(req.url);
  let cuerpo = {};
  try { cuerpo = await req.json(); } catch { /* algunos avisos vienen sin cuerpo */ }
  const tipo = cuerpo.type || cuerpo.topic || url.searchParams.get("type") || url.searchParams.get("topic");
  const id = (cuerpo.data && cuerpo.data.id) || url.searchParams.get("data.id") || url.searchParams.get("id");
  if (tipo !== "payment" || !id) return json({ ok: true });

  const r = await fetch("https://api.mercadopago.com/v1/payments/" + encodeURIComponent(id), { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) { console.log("MP pago", id, r.status); return json({ ok: true }); }
  const pago = await r.json();
  const codigo = pago.external_reference;
  if (!codigo) return json({ ok: true });

  const store = pedidos();
  const p = await store.get(codigo, { type: "json" });
  if (!p) return json({ ok: true });
  p.mp = { id: pago.id, estado: pago.status, detalle: pago.status_detail, monto: pago.transaction_amount, fecha: pago.date_approved || pago.date_last_updated };

  const yaAvisado = p.estado === "pagado" || p.estado === "enviado";
  if (pago.status === "approved" && !yaAvisado) {
    p.estado = "pagado";
    await store.setJSON(codigo, p);
    await avisarWhatsApp([
      "💳 *Venta confirmada por Mercado Pago* · JUMA",
      `Pago aprobado: ${precio(pago.transaction_amount)} (operación ${pago.id})`,
      "",
      resumenPedido(p),
      "",
      "Coordiná el envío con la clienta."
    ].join("\n"));
  } else {
    await store.setJSON(codigo, p);
  }
  return json({ ok: true });
};
