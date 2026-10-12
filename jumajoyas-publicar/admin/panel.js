/* ==========================================================
   Panel de administración JUMA Joyas
   - Ingreso: Netlify Identity (email y contraseña, solo invitados)
   - Guardado: Git Gateway de Netlify → commit en GitHub → la tienda
     se vuelve a publicar sola en 1–2 minutos.
   - Modo demo (solo en localhost con ?demo): muestra el panel con los
     datos locales y no guarda nada. Sirve para probar el diseño.
   ========================================================== */
(function () {
  "use strict";

  const RAIZ = "jumajoyas-publicar/";               // carpeta de la tienda dentro del repositorio
  const RUTA_PRODUCTOS = RAIZ + "data/productos.json";
  const RUTA_CONFIG = RAIZ + "data/config.json";
  const CARPETA_FOTOS = "img/productos/";
  const API = "/.netlify/git/github";
  const DEMO = location.hostname === "localhost" && new URLSearchParams(location.search).has("demo");

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const fmt = new Intl.NumberFormat("es-UY", { style: "currency", currency: "UYU", maximumFractionDigits: 0 });
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const normalizar = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const slug = s => normalizar(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "producto";

  let productos = [], shaProductos = null;
  let config = {}, shaConfig = null;
  let editando = null;          // producto que se está editando (copia)
  let fotosEditor = [];         // [{ src, nueva: bool, blob?, nombre? }]

  /* ---------- avisos ---------- */
  let avisoT;
  function aviso(texto, tipo) {
    const a = $("#aviso");
    a.textContent = texto; a.className = "aviso visible" + (tipo ? " aviso--" + tipo : "");
    clearTimeout(avisoT); avisoT = setTimeout(() => a.classList.remove("visible"), tipo === "error" ? 7000 : 4000);
  }

  /* ---------- GitHub a través de Git Gateway ---------- */
  async function token() {
    const u = netlifyIdentity.currentUser();
    if (!u) throw new Error("Tu sesión terminó. Volvé a ingresar.");
    return u.jwt();
  }
  async function api(ruta, opciones) {
    const r = await fetch(API + ruta, { ...opciones, headers: { "Content-Type": "application/json", Authorization: "Bearer " + await token() } });
    if (!r.ok) {
      const txt = await r.text();
      if (r.status === 401 || r.status === 403) throw new Error("No tenés permiso para guardar. Revisá que Git Gateway esté activado en Netlify.");
      if (r.status === 409) { const e = new Error("conflicto"); e.conflicto = true; throw e; }
      throw new Error("Error " + r.status + ": " + txt.slice(0, 120));
    }
    return r.json();
  }
  const aBase64 = texto => btoa(unescape(encodeURIComponent(texto)));
  const deBase64 = b64 => decodeURIComponent(escape(atob(b64.replace(/\n/g, ""))));
  async function leerJson(ruta) {
    const d = await api("/contents/" + ruta + "?ref=main&t=" + Date.now());
    return { datos: JSON.parse(deBase64(d.content)), sha: d.sha };
  }
  async function escribir(ruta, contenidoBase64, sha, mensaje) {
    const body = { message: mensaje, content: contenidoBase64, branch: "main" };
    if (sha) body.sha = sha;
    const d = await api("/contents/" + ruta, { method: "PUT", body: JSON.stringify(body) });
    return d.content.sha;
  }
  const json = obj => JSON.stringify(obj, null, 2) + "\n";

  /* ---------- carga ---------- */
  async function cargar() {
    if (DEMO) {
      productos = (await (await fetch("../data/productos.json", { cache: "no-store" })).json()).productos;
      config = await (await fetch("../data/config.json", { cache: "no-store" })).json();
    } else {
      const p = await leerJson(RUTA_PRODUCTOS); productos = p.datos.productos || []; shaProductos = p.sha;
      const c = await leerJson(RUTA_CONFIG); config = c.datos; shaConfig = c.sha;
    }
    armarFiltros(); pintarGrilla(); pintarTienda();
  }

  /* ---------- guardado de productos (con reintento si alguien guardó antes) ---------- */
  async function guardarProductos(cambiar, mensaje) {
    cambiar(productos);
    if (DEMO) { aviso("Modo demo: no se guardó nada.", "ok"); return; }
    try {
      shaProductos = await escribir(RUTA_PRODUCTOS, aBase64(json({ productos })), shaProductos, mensaje);
    } catch (e) {
      if (!e.conflicto) throw e;
      const p = await leerJson(RUTA_PRODUCTOS);       // otra persona guardó: se toma lo último y se reaplica el cambio
      productos = p.datos.productos || []; cambiar(productos);
      shaProductos = await escribir(RUTA_PRODUCTOS, aBase64(json({ productos })), p.sha, mensaje);
    }
  }

  /* ---------- filtros y grilla ---------- */
  function categorias() {
    const base = config.categorias || ["Aros", "Anillos", "Pulseras", "Collares"];
    const usadas = productos.map(p => p.categoria).filter(Boolean);
    return [...new Set(base.concat(usadas))];
  }
  function marcas() { return [...new Set(productos.map(p => p.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")); }
  function armarFiltros() {
    const fc = $("#f-cat"), fm = $("#f-marca"), vc = fc.value, vm = fm.value;
    fc.innerHTML = '<option value="">Todas las categorías</option>' + categorias().map(c => `<option>${esc(c)}</option>`).join("");
    fm.innerHTML = '<option value="">Todas las marcas</option>' + marcas().map(m => `<option>${esc(m)}</option>`).join("");
    fc.value = vc; fm.value = vm;
    $("#lista-marcas").innerHTML = marcas().map(m => `<option value="${esc(m)}">`).join("");
    $('#form-producto [name="categoria"]').innerHTML = categorias().map(c => `<option>${esc(c)}</option>`).join("");
  }
  const agotado = p => p.stock !== null && p.stock !== undefined && p.stock !== "" && Number(p.stock) <= 0;

  function pintarGrilla() {
    const q = normalizar($("#f-buscar").value), cat = $("#f-cat").value, marca = $("#f-marca").value, est = $("#f-estado").value;
    const lista = productos.filter(p =>
      (!q || normalizar(p.nombre + " " + (p.marca || "")).includes(q)) &&
      (!cat || p.categoria === cat) && (!marca || p.marca === marca) &&
      (!est || (est === "visibles" && p.activo !== false) || (est === "ocultos" && p.activo === false) ||
        (est === "agotados" && agotado(p)) || (est === "favoritas" && p.destacado)));
    const visibles = productos.filter(p => p.activo !== false).length;
    $("#n-productos").textContent = productos.length;
    $("#resumen-productos").textContent = `${productos.length} productos · ${visibles} visibles en la tienda · ${productos.filter(agotado).length} agotados`;
    $("#vacio").hidden = lista.length > 0;
    $("#grilla").innerHTML = lista.map(p => {
      const sinStock = p.stock === null || p.stock === undefined || p.stock === "";
      return `<article class="prod" data-id="${esc(p.id)}">
        <button class="prod__img" data-editar aria-label="Editar ${esc(p.nombre)}">
          ${p.imagenes && p.imagenes[0] ? `<img src="../${esc(p.imagenes[0])}" alt="" loading="lazy">` : '<span class="prod__sin-foto">Sin foto</span>'}
          <span class="prod__badges">
            ${p.destacado ? '<span class="badge badge--fav">Favorita</span>' : ""}
            ${p.activo === false ? '<span class="badge badge--oculto">Oculto</span>' : ""}
            ${agotado(p) ? '<span class="badge badge--agotado">Agotado</span>' : ""}
          </span>
        </button>
        <div class="prod__info" data-editar>
          ${p.marca ? `<div class="prod__marca">${esc(p.marca)}</div>` : ""}
          <div class="prod__nombre">${esc(p.nombre)}</div>
          <div class="prod__precio">${fmt.format(p.precio || 0)}</div>
        </div>
        <div class="prod__pie">
          <div class="stock" title="Stock">
            <button data-stock="-1" aria-label="Restar stock">−</button>
            <span>${sinStock ? "—" : Number(p.stock)}</span>
            <button data-stock="1" aria-label="Sumar stock">+</button>
            <small>stock</small>
          </div>
          <label class="interruptor" title="Visible en la tienda"><input type="checkbox" data-visible ${p.activo !== false ? "checked" : ""}><span></span>Visible</label>
        </div>
      </article>`;
    }).join("");
  }

  // cambios rápidos desde la grilla (stock y visible)
  let rapidoT = null; const pendientesRapidos = new Map();
  function cambioRapido(id, cambio) {
    const p = productos.find(x => x.id === id); if (!p) return;
    cambio(p); pintarGrilla();
    pendientesRapidos.set(id, { stock: p.stock, activo: p.activo });   // se guarda el valor final, no el clic
    clearTimeout(rapidoT);
    rapidoT = setTimeout(async () => {               // se agrupan los clics seguidos en un solo guardado
      const cambios = [...pendientesRapidos.entries()]; pendientesRapidos.clear();
      try {
        await guardarProductos(lista => cambios.forEach(([i, val]) => { const a = lista.find(x => x.id === i); if (a) { a.stock = val.stock; a.activo = val.activo; } }), "Panel: stock / visibilidad");
        aviso("Guardado. La tienda se actualiza en 1–2 minutos.", "ok");
      } catch (e) { aviso(e.message, "error"); }
    }, 1200);
  }
  $("#grilla").addEventListener("click", e => {
    const tarjeta = e.target.closest(".prod"); if (!tarjeta) return;
    const id = tarjeta.dataset.id;
    const bStock = e.target.closest("[data-stock]");
    if (bStock) {
      const d = Number(bStock.dataset.stock);
      cambioRapido(id, p => { const s = (p.stock === null || p.stock === undefined || p.stock === "") ? 0 : Number(p.stock); p.stock = Math.max(0, s + d); });
      return;
    }
    if (e.target.closest("[data-editar]")) abrirEditor(productos.find(p => p.id === id));
  });
  $("#grilla").addEventListener("change", e => {
    if (!e.target.matches("[data-visible]")) return;
    const id = e.target.closest(".prod").dataset.id, v = e.target.checked;
    cambioRapido(id, p => { p.activo = v; });
  });
  ["#f-buscar", "#f-cat", "#f-marca", "#f-estado"].forEach(s => $(s).addEventListener("input", pintarGrilla));

  /* ---------- editor ---------- */
  const form = $("#form-producto");
  function abrirEditor(p) {
    const nuevo = !p;
    editando = p ? JSON.parse(JSON.stringify(p)) : { id: "", nombre: "", marca: marcas()[0] || "", categoria: categorias()[0], precio: "", stock: 1, descripcion: "", material: "", medidas: "", color: "", destacado: false, activo: true, imagenes: [] };
    editando._nuevo = nuevo;
    $("#editor-titulo").textContent = nuevo ? "Nuevo producto" : "Editar producto";
    $("#btn-eliminar").hidden = nuevo;
    form.reset();
    ["nombre", "marca", "categoria", "precio", "descripcion", "material", "medidas", "color"].forEach(k => { form.elements[k].value = editando[k] == null ? "" : editando[k]; });
    form.elements.stock.value = editando.stock == null ? "" : editando.stock;
    const conTalles = Array.isArray(editando.talles) && editando.talles.length > 0;
    form.elements.conTalles.checked = conTalles;
    form.elements.talles.value = conTalles ? editando.talles.join(", ") : "";
    form.elements.etiquetaTalle.value = editando.etiquetaTalle || "Talle";
    $("#bloque-talles").hidden = !conTalles;
    form.elements.activo.checked = editando.activo !== false;
    form.elements.destacado.checked = !!editando.destacado;
    fotosEditor = (editando.imagenes || []).map(src => ({ src: "../" + src, ruta: src, nueva: false }));
    pintarFotos();
    $$(".campo-error").forEach(x => x.classList.remove("campo-error"));
    $("#editor").hidden = false; document.body.style.overflow = "hidden";
    setTimeout(() => form.elements.nombre.focus(), 50);
  }
  function cerrarEditor() {
    fotosEditor.filter(f => f.nueva).forEach(f => URL.revokeObjectURL(f.src));
    $("#editor").hidden = true; document.body.style.overflow = ""; editando = null;
  }
  $$("[data-cerrar]").forEach(b => b.addEventListener("click", cerrarEditor));
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#editor").hidden) cerrarEditor(); });
  form.elements.conTalles.addEventListener("change", () => { $("#bloque-talles").hidden = !form.elements.conTalles.checked; });
  $$("[data-stock]").filter(b => b.closest(".paso-num")).forEach(b => b.addEventListener("click", () => {
    const v = form.elements.stock.value === "" ? 0 : Number(form.elements.stock.value);
    form.elements.stock.value = Math.max(0, v + Number(b.dataset.stock));
  }));

  // fotos: subir, ordenar, quitar
  function pintarFotos() {
    $("#fotos").innerHTML = fotosEditor.map((f, i) => `<div class="foto${f.nueva ? " foto--nueva" : ""}">
      <img src="${esc(f.src)}" alt="">
      <div class="foto__acciones">
        ${i > 0 ? `<button type="button" data-mover="${i}" title="Mover a la izquierda">←</button>` : ""}
        ${i < fotosEditor.length - 1 ? `<button type="button" data-mover-der="${i}" title="Mover a la derecha">→</button>` : ""}
        <button type="button" data-quitar="${i}" title="Quitar foto">✕</button>
      </div>
      ${i === 0 ? '<span class="foto__principal">Principal</span>' : ""}
    </div>`).join("");
  }
  $("#fotos").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.quitar) { const [f] = fotosEditor.splice(Number(b.dataset.quitar), 1); if (f.nueva) URL.revokeObjectURL(f.src); }
    if (b.dataset.mover) { const i = Number(b.dataset.mover); [fotosEditor[i - 1], fotosEditor[i]] = [fotosEditor[i], fotosEditor[i - 1]]; }
    if (b.dataset.moverDer) { const i = Number(b.dataset.moverDer); [fotosEditor[i + 1], fotosEditor[i]] = [fotosEditor[i], fotosEditor[i + 1]]; }
    pintarFotos();
  });
  // las fotos se achican (máx. 1400 px) y se pasan a WebP antes de subirlas, así la tienda carga rápido
  async function prepararFoto(archivo) {
    const bmp = await createImageBitmap(archivo);
    const escala = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/webp", 0.86));
    return { src: URL.createObjectURL(blob), blob, nueva: true };
  }
  async function agregarArchivos(archivos) {
    const imgs = [...archivos].filter(f => f.type.startsWith("image/"));
    if (!imgs.length) return;
    aviso(`Preparando ${imgs.length} foto${imgs.length > 1 ? "s" : ""}…`);
    for (const f of imgs) { try { fotosEditor.push(await prepararFoto(f)); } catch (e) { aviso("No se pudo leer " + f.name, "error"); } }
    pintarFotos();
  }
  $("#input-fotos").addEventListener("change", e => { agregarArchivos(e.target.files); e.target.value = ""; });
  const zona = $("#zona-subir");
  ["dragenter", "dragover"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.add("arrastrando"); }));
  ["dragleave", "drop"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.remove("arrastrando"); }));
  zona.addEventListener("drop", e => agregarArchivos(e.dataTransfer.files));

  const blobABase64 = blob => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = mal; r.readAsDataURL(blob); });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    $$(".campo-error").forEach(x => x.classList.remove("campo-error"));
    const v = k => form.elements[k].value.trim();
    const faltan = ["nombre", "categoria", "precio"].filter(k => !v(k));
    if (faltan.length) { faltan.forEach(k => form.elements[k].closest("label").classList.add("campo-error")); aviso("Completá nombre, categoría y precio.", "error"); return; }
    if (!fotosEditor.length) { aviso("Agregá al menos una foto.", "error"); return; }

    const p = editando;
    p.nombre = v("nombre"); p.marca = v("marca"); p.categoria = v("categoria");
    p.precio = Number(v("precio")); p.stock = v("stock") === "" ? null : Number(v("stock"));
    p.descripcion = v("descripcion"); p.material = v("material"); p.medidas = v("medidas"); p.color = v("color");
    p.activo = form.elements.activo.checked; p.destacado = form.elements.destacado.checked;
    if (form.elements.conTalles.checked && v("talles")) {
      p.talles = v("talles").split(",").map(t => t.trim()).filter(Boolean);
      p.etiquetaTalle = form.elements.etiquetaTalle.value;
    } else { delete p.talles; delete p.etiquetaTalle; }
    if (p._nuevo) {                               // id único a partir del nombre (se usa en la dirección web)
      let id = slug(p.nombre), n = 2;
      while (productos.some(x => x.id === id)) id = slug(p.nombre) + "-" + n++;
      p.id = id;
    }

    const btn = $("#btn-guardar"); btn.disabled = true; btn.textContent = "Guardando…";
    try {
      // 1) subir las fotos nuevas
      const rutas = [];
      let n = 0;
      for (const f of fotosEditor) {
        if (!f.nueva) { rutas.push(f.ruta); continue; }
        n++;
        const ruta = `${CARPETA_FOTOS}${p.id}-${Date.now().toString(36)}-${n}.webp`;
        btn.textContent = `Subiendo foto ${n}…`;
        if (!DEMO) await escribir(RAIZ + ruta, await blobABase64(f.blob), null, `Panel: foto de ${p.nombre}`);
        rutas.push(ruta);
      }
      p.imagenes = rutas;
      // 2) guardar el producto
      btn.textContent = "Guardando…";
      const nuevo = p._nuevo; delete p._nuevo;
      await guardarProductos(lista => {
        const i = lista.findIndex(x => x.id === p.id);
        if (i >= 0) lista[i] = p; else lista.unshift(p);
      }, `Panel: ${nuevo ? "nuevo producto" : "editar"} ${p.nombre}`);
      cerrarEditor(); armarFiltros(); pintarGrilla();
      aviso("Guardado. La tienda se actualiza en 1–2 minutos.", "ok");
    } catch (err) {
      aviso(err.message, "error");
    } finally { btn.disabled = false; btn.textContent = "Guardar"; }
  });

  $("#btn-eliminar").addEventListener("click", async () => {
    const p = editando; if (!p) return;
    if (!confirm(`¿Eliminar "${p.nombre}" de la tienda? Si solo querés esconderlo, usá "Visible en la tienda".`)) return;
    try {
      await guardarProductos(lista => { const i = lista.findIndex(x => x.id === p.id); if (i >= 0) lista.splice(i, 1); }, `Panel: eliminar ${p.nombre}`);
      cerrarEditor(); armarFiltros(); pintarGrilla(); aviso("Producto eliminado.", "ok");
    } catch (e) { aviso(e.message, "error"); }
  });
  $("#btn-nuevo").addEventListener("click", () => abrirEditor(null));

  /* ---------- pestaña Tienda ---------- */
  const formT = $("#form-tienda");
  function pintarTienda() {
    formT.elements.email.value = (config.contacto && config.contacto.email) || "";
    formT.elements.instagram.value = (config.redes && config.redes.instagram) || "";
    formT.elements.envioGratisDesde.value = config.envioGratisDesde || "";
    $("#zonas").innerHTML = (config.zonasMontevideo || []).map((z, i) => `<label>${esc(z.nombre)}<input type="number" min="0" step="10" data-zona="${i}" value="${z.costo == null ? "" : z.costo}"></label>`).join("");
  }
  formT.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = formT.querySelector("button[type=submit]"); btn.disabled = true;
    const aplicar = c => {
      c.contacto = c.contacto || {}; c.redes = c.redes || {};
      c.contacto.email = formT.elements.email.value.trim();
      c.redes.instagram = formT.elements.instagram.value.trim();
      c.envioGratisDesde = formT.elements.envioGratisDesde.value ? Number(formT.elements.envioGratisDesde.value) : null;
      $$("[data-zona]").forEach(inp => { const z = (c.zonasMontevideo || [])[Number(inp.dataset.zona)]; if (z) z.costo = inp.value === "" ? null : Number(inp.value); });
    };
    try {
      aplicar(config);
      if (DEMO) aviso("Modo demo: no se guardó nada.", "ok");
      else {
        try { shaConfig = await escribir(RUTA_CONFIG, aBase64(json(config)), shaConfig, "Panel: datos de la tienda"); }
        catch (err) { if (!err.conflicto) throw err; const c = await leerJson(RUTA_CONFIG); config = c.datos; aplicar(config); shaConfig = await escribir(RUTA_CONFIG, aBase64(json(config)), c.sha, "Panel: datos de la tienda"); }
        aviso("Guardado. La tienda se actualiza en 1–2 minutos.", "ok");
      }
    } catch (err) { aviso(err.message, "error"); }
    finally { btn.disabled = false; }
  });

  /* ---------- pestañas ---------- */
  function irA() {
    const tab = location.hash === "#tienda" ? "tienda" : "productos";
    $("#vista-productos").hidden = tab !== "productos"; $("#vista-tienda").hidden = tab !== "tienda";
    $$("[data-tab]").forEach(a => a.classList.toggle("activo", a.dataset.tab === tab));
  }
  window.addEventListener("hashchange", irA);

  /* ---------- sesión ---------- */
  function mostrarPanel(email) {
    $("#ingreso").hidden = true; $("#panel").hidden = false;
    $("#usuario").textContent = email || "";
    irA();
    cargar().catch(e => aviso("No se pudieron cargar los productos: " + e.message, "error"));
  }
  function mostrarIngreso() { $("#panel").hidden = true; $("#ingreso").hidden = false; }

  if (DEMO) { mostrarPanel("modo demo"); return; }
  netlifyIdentity.on("init", u => u ? mostrarPanel(u.email) : mostrarIngreso());
  netlifyIdentity.on("login", u => { netlifyIdentity.close(); mostrarPanel(u.email); });
  netlifyIdentity.on("logout", mostrarIngreso);
  $("#btn-ingresar").addEventListener("click", () => netlifyIdentity.open("login"));
  $("#btn-salir").addEventListener("click", () => netlifyIdentity.logout());
})();
