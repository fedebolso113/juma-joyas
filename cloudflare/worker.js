// =============================================================
// JUMA Joyas — Worker de Cloudflare
// Sirve la tienda (archivos de jumajoyas-publicar/) y la API:
//   /api/pedido, /api/comprobante, /api/suscribir, /api/mp-webhook
//   /api/login, /api/logout, /api/admin/*  (panel, con sesión)
//   /data/productos.json y /data/config.json  → desde el almacenamiento (KV)
//   /img/subidas/*                            → fotos subidas desde el panel
// Datos en KV (binding DATOS):
//   catalogo:productos, catalogo:config, img:<archivo>,
//   pedido:<código>, comprobante:<código>, suscriptor:<email>, intentos:<ip>
// Secretos (se cargan en Cloudflare, nunca en el código):
//   ADMIN_PASSWORD, WHATSAPP_TELEFONO, WHATSAPP_APIKEY, MP_ACCESS_TOKEN
// Variable: ADMIN_EMAIL (mail con el que se entra al panel)
// =============================================================

const json = (datos, status = 200, extra = {}) =>
  new Response(JSON.stringify(datos), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });
const fmt = new Intl.NumberFormat("es-UY", { style: "currency", currency: "UYU", maximumFractionDigits: 0 });
const precio = n => fmt.format(n || 0);
const emailValido = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || "").trim());
const MAX_COMPROBANTE = 4 * 1024 * 1024;
const MAX_IMAGEN = 5 * 1024 * 1024;
const TIPOS_COMPROBANTE = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const ESTADOS = ["esperando-pago", "comprobante-recibido", "aprobado", "pagado", "enviado", "cancelado"];

/* ---------- catálogo: KV si existe, si no los archivos publicados ---------- */
async function leerCatalogo(env, request, nombre) {
  const kv = await env.DATOS.get("catalogo:" + nombre, { type: "json" });
  if (kv) return kv;
  const r = await env.ASSETS.fetch(new Request(new URL(`/data/${nombre}.json`, request.url)));
  return r.json();
}

/* ---------- WhatsApp (CallMeBot) ---------- */
async function avisarWhatsApp(env, texto) {
  if (!env.WHATSAPP_TELEFONO || !env.WHATSAPP_APIKEY) { console.log("Aviso por WhatsApp desactivado (faltan secretos)."); return false; }
  // se limpian espacios, saltos de línea u otros caracteres que se cuelan al cargar los secretos
  const telefono = "+" + String(env.WHATSAPP_TELEFONO).replace(/\D/g, "");
  const apikey = String(env.WHATSAPP_APIKEY).replace(/\D/g, "");     // las claves de CallMeBot son solo números
  console.log("Clave guardada:", String(env.WHATSAPP_APIKEY).length, "caracteres,", apikey.length, "números");
  const url = "https://api.callmebot.com/whatsapp.php?phone=" + encodeURIComponent(telefono) +
    "&text=" + encodeURIComponent(texto) + "&apikey=" + encodeURIComponent(apikey);
  try {
    const r = await fetch(url);
    const txt = (await r.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    console.log("WhatsApp:", r.status, txt);
    return r.ok;
  } catch (e) { console.log("WhatsApp falló:", e.message); return false; }
}

function resumenPedido(p) {
  return [
    `Código: *${p.codigo}*`, "",
    ...p.lineas.map(l => `${l.cant} × ${l.nombre} (${precio(l.precio * l.cant)})`), "",
    `Entrega: ${p.envio.nombre} (${p.envio.texto})`,
    p.direccion ? `Dirección: ${p.direccion}` : null,
    `Pago: ${p.pago.nombre}`,
    `*Total: ${precio(p.total)}*${p.costoEnvio === null && !p.envio.pagaComprador ? " + envío a confirmar" : ""}`, "",
    `Clienta: ${p.cliente.nombre}`, `Mail: ${p.cliente.email}`, `Celular: ${p.cliente.telefono}`,
    p.notas ? `Notas: ${p.notas}` : null
  ].filter(l => l !== null).join("\n");
}

/* ---------- cálculo del pedido con los precios publicados ---------- */
async function calcularPedido(env, request, entrada) {
  const [prod, cfg] = await Promise.all([leerCatalogo(env, request, "productos"), leerCatalogo(env, request, "config")]);
  const productos = prod.productos || [];
  const lineas = [];
  for (const l of entrada.lineas || []) {
    const p = productos.find(x => x.id === l.id && x.activo !== false);
    if (!p) throw new Error("Un producto del carrito ya no está disponible.");
    const cant = Math.max(1, Math.min(20, Number(l.cant) || 1));
    if (p.stock !== null && p.stock !== undefined && p.stock !== "" && Number(p.stock) < cant) throw new Error(`${p.nombre} ya no está disponible.`);
    const talle = l.talle && Array.isArray(p.talles) && p.talles.includes(l.talle) ? l.talle : "";
    lineas.push({ id: p.id, cant, precio: Number(p.precio) || 0, talle,
      nombre: (p.marca ? p.marca + " · " : "") + p.nombre + (talle ? ` (${(p.etiquetaTalle || "talle").toLowerCase()} ${talle})` : "") });
  }
  if (!lineas.length) throw new Error("El carrito está vacío.");
  const subtotal = lineas.reduce((s, l) => s + l.precio * l.cant, 0);
  const envio = (cfg.envios || []).find(e => e.id === entrada.envio && e.activo !== false);
  if (!envio) throw new Error("Elegí una forma de entrega.");
  const pago = (cfg.pagos || []).find(p => p.id === entrada.pago && p.activo !== false);
  if (!pago) throw new Error("Elegí una forma de pago.");
  let costoEnvio = null, zona = null;
  const gratis = cfg.envioGratisDesde && subtotal >= cfg.envioGratisDesde && envio.requiereDireccion;
  if (envio.pagaComprador || gratis) costoEnvio = 0;
  else if (envio.usaZonas) {
    zona = (cfg.zonasMontevideo || []).find(z => (z.barrios || []).includes(entrada.barrio)) || null;
    costoEnvio = zona && zona.costo != null ? Number(zona.costo) : null;
  } else costoEnvio = envio.costo == null || envio.costo === "" ? null : Number(envio.costo);
  const texto = envio.pagaComprador ? "a cargo del comprador" : (costoEnvio === null ? "a confirmar" : (costoEnvio === 0 ? "sin costo" : precio(costoEnvio)));
  return {
    lineas, subtotal, costoEnvio, total: subtotal + (envio.pagaComprador ? 0 : (costoEnvio || 0)),
    envio: { id: envio.id, nombre: envio.nombre + (zona ? " · " + zona.nombre : ""), texto, requiereDireccion: !!envio.requiereDireccion, pagaComprador: !!envio.pagaComprador },
    pago: { id: pago.id, nombre: pago.nombre },
    datosTransferencia: cfg.datosTransferencia || ""
  };
}

/* ---------- sesión del panel (cookie firmada) ---------- */
const enc = new TextEncoder();
async function firmar(env, texto) {
  const clave = await crypto.subtle.importKey("raw", enc.encode("juma-panel:" + env.ADMIN_PASSWORD), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("HMAC", clave, enc.encode(texto));
  return btoa(String.fromCharCode(...new Uint8Array(firma))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function iguales(a, b) {          // comparación en tiempo constante
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function sesionValida(env, request) {
  if (!env.ADMIN_PASSWORD) return false;
  const cookie = (request.headers.get("Cookie") || "").split(/;\s*/).find(c => c.startsWith("juma_sesion="));
  if (!cookie) return false;
  const [vence, firma] = decodeURIComponent(cookie.slice(12)).split(".");
  if (!vence || !firma || Number(vence) < Date.now()) return false;
  return iguales(firma, await firmar(env, vence));
}
async function login(env, request) {
  if (!env.ADMIN_PASSWORD) return json({ error: "Falta configurar la contraseña del panel en Cloudflare." }, 503);
  const ip = request.headers.get("CF-Connecting-IP") || "x";
  const claveIntentos = "intentos:" + ip;
  const intentos = Number(await env.DATOS.get(claveIntentos)) || 0;
  if (intentos >= 8) return json({ error: "Demasiados intentos. Probá de nuevo en 15 minutos." }, 429);
  const { email, password } = await request.json().catch(() => ({}));
  const okEmail = !env.ADMIN_EMAIL || String(email || "").trim().toLowerCase() === env.ADMIN_EMAIL.toLowerCase();
  const okPass = iguales(String(password || ""), env.ADMIN_PASSWORD);
  if (!okEmail || !okPass) {
    await env.DATOS.put(claveIntentos, String(intentos + 1), { expirationTtl: 900 });
    return json({ error: "Mail o contraseña incorrectos." }, 401);
  }
  const vence = String(Date.now() + 1000 * 60 * 60 * 24 * 14);   // la sesión dura 14 días
  const valor = encodeURIComponent(vence + "." + await firmar(env, vence));
  return json({ ok: true }, 200, { "Set-Cookie": `juma_sesion=${valor}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${60 * 60 * 24 * 14}` });
}

/* ---------- API pública ---------- */
async function crearPedido(env, request) {
  const e = await request.json().catch(() => null);
  if (!e) return json({ error: "Datos inválidos." }, 400);
  const c = e.cliente || {};
  if (!c.nombre || String(c.nombre).trim().length < 2) return json({ error: "Completá tu nombre." }, 400);
  if (!emailValido(c.email)) return json({ error: "Ingresá un email válido." }, 400);
  if (String(c.telefono || "").replace(/\D/g, "").length < 8) return json({ error: "Ingresá un celular válido." }, 400);
  let calc;
  try { calc = await calcularPedido(env, request, e); } catch (err) { return json({ error: err.message }, 400); }
  if (calc.envio.requiereDireccion && !String(e.direccion || "").trim()) return json({ error: "Completá la dirección de entrega." }, 400);

  const ahora = new Date(), origen = new URL(request.url).origin;
  const codigo = "JUMA-" + ahora.toISOString().slice(2, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const pedido = {
    codigo, fecha: ahora.toISOString(), estado: "esperando-pago",
    cliente: { nombre: String(c.nombre).trim(), email: String(c.email).trim().toLowerCase(), telefono: String(c.telefono).trim() },
    newsletter: !!e.newsletter, direccion: calc.envio.requiereDireccion ? String(e.direccion).trim() : "", notas: String(e.notas || "").slice(0, 500),
    lineas: calc.lineas, subtotal: calc.subtotal, costoEnvio: calc.costoEnvio, total: calc.total, envio: calc.envio, pago: calc.pago
  };
  await env.DATOS.put("pedido:" + codigo, JSON.stringify(pedido));
  if (pedido.newsletter) await guardarSuscriptor(env, pedido.cliente.email, pedido.cliente.nombre, "compra " + codigo);

  if (pedido.pago.id === "mercadopago") {
    if (!env.MP_ACCESS_TOKEN) return json({ codigo, total: pedido.total, modo: "mercadopago-manual" });
    const items = pedido.lineas.map(l => ({ title: l.nombre, quantity: l.cant, unit_price: l.precio, currency_id: "UYU" }));
    if (pedido.costoEnvio && !pedido.envio.pagaComprador) items.push({ title: "Envío: " + pedido.envio.nombre, quantity: 1, unit_price: pedido.costoEnvio, currency_id: "UYU" });
    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.MP_ACCESS_TOKEN },
      body: JSON.stringify({
        items, external_reference: codigo, payer: { name: pedido.cliente.nombre, email: pedido.cliente.email },
        back_urls: { success: `${origen}/#/gracias?codigo=${codigo}`, pending: `${origen}/#/gracias?codigo=${codigo}&estado=pendiente`, failure: `${origen}/#/gracias?codigo=${codigo}&estado=error` },
        auto_return: "approved", notification_url: `${origen}/api/mp-webhook`, statement_descriptor: "JUMA JOYAS"
      })
    });
    const pref = await r.json().catch(() => ({}));
    if (!r.ok || !pref.init_point) { console.log("Mercado Pago:", r.status, JSON.stringify(pref).slice(0, 300)); return json({ codigo, total: pedido.total, modo: "mercadopago-manual" }); }
    return json({ codigo, total: pedido.total, modo: "mercadopago", pagar: pref.init_point });
  }
  return json({ codigo, total: pedido.total, modo: "transferencia", datosTransferencia: calc.datosTransferencia });
}

// el comprobante llega como archivo (cuerpo binario) con ?codigo=…&email=…
async function subirComprobante(env, request) {
  const url = new URL(request.url);
  const codigo = String(url.searchParams.get("codigo") || "").trim().toUpperCase();
  const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
  const tipo = (request.headers.get("Content-Type") || "").split(";")[0].trim();
  const p = await env.DATOS.get("pedido:" + codigo, { type: "json" });
  if (!p || p.cliente.email !== email) return json({ error: "No encontramos una compra con ese código y ese mail." }, 404);
  if (["aprobado", "pagado", "enviado", "cancelado"].includes(p.estado)) return json({ error: "Esta compra ya fue procesada. Si tenés dudas, escribinos." }, 409);
  if (!TIPOS_COMPROBANTE.includes(tipo)) return json({ error: "Subí una foto (JPG, PNG) o un PDF del comprobante." }, 400);
  const datos = await request.arrayBuffer();
  if (!datos.byteLength) return json({ error: "No llegó el archivo." }, 400);
  if (datos.byteLength > MAX_COMPROBANTE) return json({ error: "El archivo es muy grande (máximo 4 MB)." }, 400);
  const fecha = new Date().toISOString();
  await env.DATOS.put("comprobante:" + codigo, datos, { metadata: { tipo, fecha } });
  p.estado = "comprobante-recibido"; p.comprobante = { tipo, fecha };
  await env.DATOS.put("pedido:" + codigo, JSON.stringify(p));
  await avisarWhatsApp(env, [
    "🧾 *Comprobante de transferencia recibido* · JUMA", `Para aprobar: ${precio(p.total)}`, "",
    resumenPedido(p), "", `👉 Revisalo y dale OK en el panel: ${url.origin}/admin/#pedidos/${codigo}`
  ].join("\n"));
  return json({ ok: true });
}

async function guardarSuscriptor(env, email, nombre, origen) {
  const clave = "suscriptor:" + email;
  if (await env.DATOS.get(clave)) return;
  await env.DATOS.put(clave, JSON.stringify({ email, nombre: String(nombre || "").slice(0, 80), origen: String(origen || "web").slice(0, 60), fecha: new Date().toISOString() }));
}

async function webhookMP(env, request) {
  if (!env.MP_ACCESS_TOKEN) return json({ ok: true });
  const url = new URL(request.url);
  const cuerpo = await request.json().catch(() => ({}));
  const tipo = cuerpo.type || cuerpo.topic || url.searchParams.get("type") || url.searchParams.get("topic");
  const id = (cuerpo.data && cuerpo.data.id) || url.searchParams.get("data.id") || url.searchParams.get("id");
  if (tipo !== "payment" || !id) return json({ ok: true });
  // se consulta el pago a Mercado Pago: no se confía en el contenido del aviso
  const r = await fetch("https://api.mercadopago.com/v1/payments/" + encodeURIComponent(id), { headers: { Authorization: "Bearer " + env.MP_ACCESS_TOKEN } });
  if (!r.ok) return json({ ok: true });
  const pago = await r.json();
  const codigo = pago.external_reference; if (!codigo) return json({ ok: true });
  const p = await env.DATOS.get("pedido:" + codigo, { type: "json" }); if (!p) return json({ ok: true });
  p.mp = { id: pago.id, estado: pago.status, detalle: pago.status_detail, monto: pago.transaction_amount, fecha: pago.date_approved || pago.date_last_updated };
  const yaAvisado = p.estado === "pagado" || p.estado === "enviado";
  if (pago.status === "approved" && !yaAvisado) {
    p.estado = "pagado";
    await env.DATOS.put("pedido:" + codigo, JSON.stringify(p));
    await avisarWhatsApp(env, ["💳 *Venta confirmada por Mercado Pago* · JUMA", `Pago aprobado: ${precio(pago.transaction_amount)} (operación ${pago.id})`, "", resumenPedido(p), "", "Coordiná el envío con la clienta."].join("\n"));
  } else await env.DATOS.put("pedido:" + codigo, JSON.stringify(p));
  return json({ ok: true });
}

/* ---------- API del panel ---------- */
async function listar(env, prefijo) {
  const claves = []; let cursor;
  do { const r = await env.DATOS.list({ prefix: prefijo, cursor }); claves.push(...r.keys.map(k => k.name)); cursor = r.list_complete ? null : r.cursor; } while (cursor);
  return (await Promise.all(claves.map(k => env.DATOS.get(k, { type: "json" })))).filter(Boolean);
}

async function admin(env, request, ruta) {
  if (!(await sesionValida(env, request))) return json({ error: "Tenés que ingresar al panel." }, 401);
  const url = new URL(request.url), m = request.method;
  if (m === "GET" && ruta === "yo") return json({ ok: true, email: env.ADMIN_EMAIL || "" });
  if (m === "PUT" && (ruta === "productos" || ruta === "config")) {
    const datos = await request.json().catch(() => null);
    if (!datos || (ruta === "productos" && !Array.isArray(datos.productos))) return json({ error: "Datos inválidos." }, 400);
    await env.DATOS.put("catalogo:" + ruta, JSON.stringify(datos));
    return json({ ok: true });
  }
  if (m === "POST" && ruta === "imagen") {
    const tipo = (request.headers.get("Content-Type") || "").split(";")[0];
    if (!/^image\/(webp|jpeg|png)$/.test(tipo)) return json({ error: "Formato de foto no admitido." }, 400);
    const datos = await request.arrayBuffer();
    if (!datos.byteLength || datos.byteLength > MAX_IMAGEN) return json({ error: "La foto es muy grande (máximo 5 MB)." }, 400);
    const base = String(url.searchParams.get("nombre") || "foto").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "foto";
    const nombre = `${base}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.${tipo.split("/")[1].replace("jpeg", "jpg")}`;
    await env.DATOS.put("img:" + nombre, datos, { metadata: { tipo } });
    return json({ ruta: "img/subidas/" + nombre });
  }
  if (m === "GET" && ruta === "pedidos") return json({ pedidos: (await listar(env, "pedido:")).sort((a, b) => b.fecha.localeCompare(a.fecha)) });
  if (m === "GET" && ruta === "comprobante") {
    const r = await env.DATOS.getWithMetadata("comprobante:" + (url.searchParams.get("codigo") || ""), { type: "arrayBuffer" });
    if (!r || !r.value) return json({ error: "Sin comprobante" }, 404);
    return new Response(r.value, { headers: { "Content-Type": (r.metadata && r.metadata.tipo) || "application/octet-stream", "Cache-Control": "private, no-store" } });
  }
  if (m === "POST" && ruta === "estado") {
    const { codigo, estado } = await request.json().catch(() => ({}));
    if (!ESTADOS.includes(estado)) return json({ error: "Estado inválido" }, 400);
    const p = await env.DATOS.get("pedido:" + codigo, { type: "json" });
    if (!p) return json({ error: "No existe ese pedido" }, 404);
    p.estado = estado; p.historial = (p.historial || []).concat({ estado, fecha: new Date().toISOString() });
    await env.DATOS.put("pedido:" + codigo, JSON.stringify(p));
    return json({ ok: true, pedido: p });
  }
  if (m === "GET" && ruta === "suscriptores") return json({ suscriptores: (await listar(env, "suscriptor:")).sort((a, b) => b.fecha.localeCompare(a.fecha)) });
  return json({ error: "No encontrado" }, 404);
}

/* ---------- ruteo ---------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url), ruta = url.pathname, m = request.method;
    try {
      if (ruta === "/data/productos.json" || ruta === "/data/config.json") {
        const datos = await leerCatalogo(env, request, ruta.slice(6, -5));
        return json(datos, 200, { "Cache-Control": "no-cache" });
      }
      if (ruta.startsWith("/img/subidas/")) {
        const r = await env.DATOS.getWithMetadata("img:" + decodeURIComponent(ruta.slice(13)), { type: "arrayBuffer", cacheTtl: 3600 });
        if (!r || !r.value) return new Response("No encontrada", { status: 404 });
        return new Response(r.value, { headers: { "Content-Type": (r.metadata && r.metadata.tipo) || "image/webp", "Cache-Control": "public, max-age=31536000, immutable" } });
      }
      if (ruta === "/api/pedido" && m === "POST") return await crearPedido(env, request);
      if (ruta === "/api/comprobante" && m === "POST") return await subirComprobante(env, request);
      if (ruta === "/api/suscribir" && m === "POST") {
        const { email, nombre, origen } = await request.json().catch(() => ({}));
        if (!emailValido(email)) return json({ error: "Ingresá un email válido." }, 400);
        await guardarSuscriptor(env, String(email).trim().toLowerCase(), nombre, origen);
        return json({ ok: true });
      }
      if (ruta === "/api/mp-webhook") return await webhookMP(env, request);
      if (ruta === "/api/login" && m === "POST") return await login(env, request);
      if (ruta === "/api/logout" && m === "POST") return json({ ok: true }, 200, { "Set-Cookie": "juma_sesion=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
      if (ruta.startsWith("/api/admin/")) return await admin(env, request, ruta.slice(11));
      if (ruta.startsWith("/api/")) return json({ error: "No encontrado" }, 404);
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.log("Error:", err && err.stack || err);
      return json({ error: "Ocurrió un error. Intentá de nuevo." }, 500);
    }
  }
};
