// Funciones compartidas por las funciones de Netlify de JUMA Joyas.
import { getStore } from "@netlify/blobs";

// Almacenamiento privado del sitio (Netlify Blobs): no es público ni está en GitHub.
export const pedidos = () => getStore({ name: "pedidos", consistency: "strong" });
export const comprobantes = () => getStore({ name: "comprobantes", consistency: "strong" });
export const suscriptores = () => getStore({ name: "suscriptores", consistency: "strong" });

export const json = (datos, status = 200) =>
  new Response(JSON.stringify(datos), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const fmt = new Intl.NumberFormat("es-UY", { style: "currency", currency: "UYU", maximumFractionDigits: 0 });
export const precio = n => fmt.format(n || 0);

export const emailValido = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || "").trim());

// Aviso a la tienda por WhatsApp (CallMeBot). Variables en Netlify:
//   WHATSAPP_TELEFONO (con código de país, ej.: +598 9X XXX XXX) y WHATSAPP_APIKEY (la clave de CallMeBot).
export async function avisarWhatsApp(texto) {
  const tel = process.env.WHATSAPP_TELEFONO, key = process.env.WHATSAPP_APIKEY;
  if (!tel || !key) { console.log("Aviso por WhatsApp desactivado (faltan variables)."); return false; }
  const url = "https://api.callmebot.com/whatsapp.php?phone=" + encodeURIComponent(tel) +
    "&text=" + encodeURIComponent(texto) + "&apikey=" + encodeURIComponent(key);
  try { const r = await fetch(url); console.log("WhatsApp:", r.status); return r.ok; }
  catch (e) { console.log("WhatsApp falló:", e.message); return false; }
}

// Verifica que quien llama sea una usuaria del panel (Netlify Identity).
export async function usuarioPanel(req) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const origen = new URL(req.url).origin;
  const r = await fetch(origen + "/.netlify/identity/user", { headers: { Authorization: auth } });
  return r.ok ? r.json() : null;
}

// Recalcula el pedido con los precios publicados (no se confía en los precios que manda el navegador).
export async function calcularPedido(entrada, origen) {
  const [prod, cfg] = await Promise.all([
    fetch(origen + "/data/productos.json", { cache: "no-store" }).then(r => r.json()),
    fetch(origen + "/data/config.json", { cache: "no-store" }).then(r => r.json())
  ]);
  const productos = prod.productos || [];
  const lineas = [];
  for (const l of entrada.lineas || []) {
    const p = productos.find(x => x.id === l.id && x.activo !== false);
    if (!p) throw new Error("Un producto del carrito ya no está disponible.");
    const cant = Math.max(1, Math.min(20, Number(l.cant) || 1));
    if (p.stock !== null && p.stock !== undefined && p.stock !== "" && Number(p.stock) < cant) throw new Error(`No hay stock suficiente de ${p.nombre}.`);
    const talle = l.talle && Array.isArray(p.talles) && p.talles.includes(l.talle) ? l.talle : "";
    lineas.push({
      id: p.id, cant, precio: Number(p.precio) || 0, talle,
      nombre: (p.marca ? p.marca + " · " : "") + p.nombre + (talle ? ` (${(p.etiquetaTalle || "talle").toLowerCase()} ${talle})` : "")
    });
  }
  if (!lineas.length) throw new Error("El carrito está vacío.");
  const subtotal = lineas.reduce((s, l) => s + l.precio * l.cant, 0);

  const envio = (cfg.envios || []).find(e => e.id === entrada.envio && e.activo !== false);
  if (!envio) throw new Error("Elegí una forma de entrega.");
  const pago = (cfg.pagos || []).find(p => p.id === entrada.pago && p.activo !== false);
  if (!pago) throw new Error("Elegí una forma de pago.");

  let costoEnvio = null, zona = null;
  const gratis = cfg.envioGratisDesde && subtotal >= cfg.envioGratisDesde && envio.requiereDireccion;
  if (envio.pagaComprador) costoEnvio = 0;
  else if (gratis) costoEnvio = 0;
  else if (envio.usaZonas) {
    zona = (cfg.zonasMontevideo || []).find(z => (z.barrios || []).includes(entrada.barrio)) || null;
    costoEnvio = zona && zona.costo != null ? Number(zona.costo) : null;
  } else costoEnvio = envio.costo == null || envio.costo === "" ? null : Number(envio.costo);

  const textoEnvio = envio.pagaComprador ? "a cargo del comprador" : (costoEnvio === null ? "a confirmar" : (costoEnvio === 0 ? "sin costo" : precio(costoEnvio)));
  return {
    lineas, subtotal, costoEnvio, total: subtotal + (envio.pagaComprador ? 0 : (costoEnvio || 0)),
    envio: { id: envio.id, nombre: envio.nombre + (zona ? " · " + zona.nombre : ""), texto: textoEnvio, requiereDireccion: !!envio.requiereDireccion, pagaComprador: !!envio.pagaComprador },
    pago: { id: pago.id, nombre: pago.nombre },
    datosTransferencia: cfg.datosTransferencia || "",
    tienda: cfg
  };
}

// Texto del pedido para los avisos por WhatsApp.
export function resumenPedido(p) {
  return [
    `Código: *${p.codigo}*`,
    "",
    ...p.lineas.map(l => `${l.cant} × ${l.nombre} (${precio(l.precio * l.cant)})`),
    "",
    `Entrega: ${p.envio.nombre} (${p.envio.texto})`,
    p.direccion ? `Dirección: ${p.direccion}` : null,
    `Pago: ${p.pago.nombre}`,
    `*Total: ${precio(p.total)}*${p.costoEnvio === null && !p.envio.pagaComprador ? " + envío a confirmar" : ""}`,
    "",
    `Clienta: ${p.cliente.nombre}`,
    `Mail: ${p.cliente.email}`,
    `Celular: ${p.cliente.telefono}`,
    p.notas ? `Notas: ${p.notas}` : null
  ].filter(l => l !== null).join("\n");
}
