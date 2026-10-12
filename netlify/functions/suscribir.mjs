// POST /api/suscribir — suma un mail a la lista de novedades (newsletter).
import { suscriptores, json, emailValido } from "../lib/comun.mjs";

export const config = { path: "/api/suscribir" };

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let e;
  try { e = await req.json(); } catch { return json({ error: "Datos inválidos." }, 400); }
  const email = String(e.email || "").trim().toLowerCase();
  if (!emailValido(email)) return json({ error: "Ingresá un email válido." }, 400);
  const s = suscriptores();
  if (!(await s.get(email))) await s.setJSON(email, { email, nombre: String(e.nombre || "").slice(0, 80), origen: String(e.origen || "web").slice(0, 60), fecha: new Date().toISOString() });
  return json({ ok: true });
};
