// POST /api/comprobante — la clienta sube el comprobante de transferencia.
// Se guarda en privado y se avisa a la tienda por WhatsApp con un enlace al panel para aprobarlo.
import { pedidos, comprobantes, json, precio, resumenPedido, avisarWhatsApp } from "../lib/comun.mjs";

export const config = { path: "/api/comprobante" };
const MAX_BYTES = 4 * 1024 * 1024;   // 4 MB
const TIPOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let e;
  try { e = await req.json(); } catch { return json({ error: "Datos inválidos." }, 400); }
  const codigo = String(e.codigo || "").trim().toUpperCase();
  const email = String(e.email || "").trim().toLowerCase();
  const store = pedidos();
  const p = await store.get(codigo, { type: "json" });
  // el código y el mail tienen que coincidir: así nadie puede subir comprobantes a pedidos ajenos
  if (!p || p.cliente.email !== email) return json({ error: "No encontramos una compra con ese código y ese mail." }, 404);
  if (["aprobado", "pagado", "enviado", "cancelado"].includes(p.estado)) return json({ error: "Esta compra ya fue procesada. Si tenés dudas, escribinos." }, 409);
  if (!TIPOS.includes(e.tipo)) return json({ error: "Subí una foto (JPG, PNG) o un PDF del comprobante." }, 400);

  const bytes = Buffer.from(String(e.archivo || ""), "base64");
  if (!bytes.length) return json({ error: "No llegó el archivo." }, 400);
  if (bytes.length > MAX_BYTES) return json({ error: "El archivo es muy grande (máximo 4 MB)." }, 400);

  await comprobantes().set(codigo, bytes, { metadata: { tipo: e.tipo, fecha: new Date().toISOString() } });
  p.estado = "comprobante-recibido";
  p.comprobante = { tipo: e.tipo, fecha: new Date().toISOString() };
  await store.setJSON(codigo, p);

  const origen = new URL(req.url).origin;
  await avisarWhatsApp([
    "🧾 *Comprobante de transferencia recibido* · JUMA",
    `Para aprobar: ${precio(p.total)}`,
    "",
    resumenPedido(p),
    "",
    `👉 Revisalo y dale OK en el panel: ${origen}/admin/#pedidos/${codigo}`
  ].join("\n"));

  return json({ ok: true });
};
