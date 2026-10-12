// Aviso automático por WhatsApp cuando entra una compra en jumajoyas.com.uy
//
// Netlify ejecuta esta función sola cada vez que llega un formulario
// (por el nombre "submission-created"). Solo actúa con el formulario "pedidos".
//
// El mensaje se manda con CallMeBot (https://www.callmebot.com) al celular de la tienda.
// Configuración en Netlify → Project configuration → Environment variables:
//   WHATSAPP_TELEFONO  número con código de país, ej.: +59898710158
//   WHATSAPP_APIKEY    la clave que te manda CallMeBot por WhatsApp
// Si faltan, la compra se guarda igual en Netlify Forms y no se manda el aviso.

exports.handler = async (event) => {
  const ok = { statusCode: 200, body: "ok" };
  let payload;
  try { payload = JSON.parse(event.body || "{}").payload; } catch (e) { return ok; }
  if (!payload || payload.form_name !== "pedidos") return ok;

  const telefono = process.env.WHATSAPP_TELEFONO;
  const apikey = process.env.WHATSAPP_APIKEY;
  if (!telefono || !apikey) {
    console.log("Aviso por WhatsApp desactivado: faltan WHATSAPP_TELEFONO / WHATSAPP_APIKEY");
    return ok;
  }

  const d = payload.data || {};
  const lineas = [
    "🛍️ *Nueva compra confirmada* · JUMA",
    `Código: *${d.codigo || "-"}*`,
    "",
    d.productos || "",
    "",
    `Entrega: ${d.entrega || "-"}`,
    d.direccion ? `Dirección: ${d.direccion}` : null,
    `Pago: ${d.pago || "-"}`,
    `*Total: ${d.total || "-"}*`,
    "",
    `Clienta: ${d.nombre || "-"}`,
    `Mail: ${d.email || "-"}`,
    `Celular: ${d.telefono || "-"}`,
    d.notas ? `Notas: ${d.notas}` : null,
    d.newsletter === "si" ? "📩 Quiere recibir novedades" : null,
    "",
    "Recordá mandarle los datos de pago por mail."
  ].filter(l => l !== null).join("\n");

  const url = "https://api.callmebot.com/whatsapp.php?phone=" + encodeURIComponent(telefono) +
    "&text=" + encodeURIComponent(lineas) + "&apikey=" + encodeURIComponent(apikey);
  try {
    const r = await fetch(url);
    console.log("Aviso por WhatsApp:", r.status);
  } catch (e) {
    console.log("No se pudo mandar el aviso por WhatsApp:", e.message);
  }
  return ok;
};
