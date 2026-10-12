// POST /api/pedido — crea una compra.
// - Recalcula precios y envío con los datos publicados de la tienda.
// - Guarda el pedido (Netlify Blobs) y, si la clienta aceptó, la suma a la lista de novedades.
// - Transferencia: devuelve los datos para transferir; la clienta después sube el comprobante.
// - Mercado Pago: crea el link de pago (si MP_ACCESS_TOKEN está configurado) y devuelve la dirección para pagar.
import { pedidos, suscriptores, json, emailValido, calcularPedido } from "../lib/comun.mjs";

export const config = { path: "/api/pedido" };

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let e;
  try { e = await req.json(); } catch { return json({ error: "Datos inválidos." }, 400); }
  const c = e.cliente || {};
  if (!c.nombre || String(c.nombre).trim().length < 2) return json({ error: "Completá tu nombre." }, 400);
  if (!emailValido(c.email)) return json({ error: "Ingresá un email válido." }, 400);
  if (String(c.telefono || "").replace(/\D/g, "").length < 8) return json({ error: "Ingresá un celular válido." }, 400);

  const origen = new URL(req.url).origin;
  let calc;
  try { calc = await calcularPedido(e, origen); } catch (err) { return json({ error: err.message }, 400); }
  if (calc.envio.requiereDireccion && !String(e.direccion || "").trim()) return json({ error: "Completá la dirección de entrega." }, 400);

  const ahora = new Date();
  const codigo = "JUMA-" + ahora.toISOString().slice(2, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const pedido = {
    codigo, fecha: ahora.toISOString(),
    estado: "esperando-pago",       // esperando-pago → comprobante-recibido → aprobado / pagado → enviado (o cancelado)
    cliente: { nombre: String(c.nombre).trim(), email: String(c.email).trim().toLowerCase(), telefono: String(c.telefono).trim() },
    newsletter: !!e.newsletter,
    direccion: calc.envio.requiereDireccion ? String(e.direccion || "").trim() : "",
    notas: String(e.notas || "").slice(0, 500),
    lineas: calc.lineas, subtotal: calc.subtotal, costoEnvio: calc.costoEnvio, total: calc.total,
    envio: calc.envio, pago: calc.pago
  };
  await pedidos().setJSON(codigo, pedido);

  if (pedido.newsletter) {
    const s = suscriptores(), clave = pedido.cliente.email;
    if (!(await s.get(clave))) await s.setJSON(clave, { email: clave, nombre: pedido.cliente.nombre, origen: "compra " + codigo, fecha: pedido.fecha });
  }

  // Mercado Pago: link de pago (Checkout Pro)
  if (pedido.pago.id === "mercadopago") {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) return json({ codigo, total: pedido.total, modo: "mercadopago-manual" });
    const items = pedido.lineas.map(l => ({ title: l.nombre, quantity: l.cant, unit_price: l.precio, currency_id: "UYU" }));
    if (pedido.costoEnvio && !pedido.envio.pagaComprador) items.push({ title: "Envío: " + pedido.envio.nombre, quantity: 1, unit_price: pedido.costoEnvio, currency_id: "UYU" });
    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        items, external_reference: codigo,
        payer: { name: pedido.cliente.nombre, email: pedido.cliente.email },
        back_urls: { success: `${origen}/#/gracias?codigo=${codigo}`, pending: `${origen}/#/gracias?codigo=${codigo}&estado=pendiente`, failure: `${origen}/#/gracias?codigo=${codigo}&estado=error` },
        auto_return: "approved",
        notification_url: `${origen}/api/mp-webhook`,
        statement_descriptor: "JUMA JOYAS"
      })
    });
    const pref = await r.json().catch(() => ({}));
    if (!r.ok || !pref.init_point) { console.log("Mercado Pago:", r.status, JSON.stringify(pref).slice(0, 300)); return json({ codigo, total: pedido.total, modo: "mercadopago-manual" }); }
    pedido.mpPreferencia = pref.id; await pedidos().setJSON(codigo, pedido);
    return json({ codigo, total: pedido.total, modo: "mercadopago", pagar: pref.init_point });
  }

  // Transferencia (u otro medio manual)
  return json({ codigo, total: pedido.total, modo: "transferencia", datosTransferencia: calc.datosTransferencia });
};
