/* ==========================================================
   JUMA Joyas — tienda
   Los productos se leen de data/productos.json y la
   configuración (WhatsApp, redes, envíos, pagos) de
   data/config.json. Se editan desde /admin sin tocar código.
   ========================================================== */
(function () {
  "use strict";

  const $app = document.getElementById("app");
  const LS_CARRITO = "juma-carrito";
  const LS_DATOS = "juma-datos-cliente";
  const DEPARTAMENTOS = ["Artigas", "Canelones", "Cerro Largo", "Colonia", "Durazno", "Flores", "Florida", "Lavalleja", "Maldonado", "Montevideo", "Paysandú", "Río Negro", "Rivera", "Rocha", "Salto", "San José", "Soriano", "Tacuarembó", "Treinta y Tres"];

  let CONFIG = {};
  let PRODUCTOS = [];
  let carrito = leerLS(LS_CARRITO, []);
  let pedidoActual = null;

  /* ---------- utilidades ---------- */
  function leerLS(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function guardarLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  const fmt = new Intl.NumberFormat("es-UY", { style: "currency", currency: "UYU", maximumFractionDigits: 0 });
  function precio(n) { return fmt.format(n || 0); }
  function normalizar(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function pendientesVisibles() { return CONFIG.mostrarCamposPendientes !== false; }
  function pendiente(texto) { return pendientesVisibles() ? `<span class="pendiente">${esc(texto || "Por completar")}</span>` : ""; }
  function producto(id) { return PRODUCTOS.find(p => p.id === id); }
  function urlProducto(p) { return "#/producto/" + encodeURIComponent(p.id); }

  function disponibilidad(p) {
    if (p.stock === null || p.stock === undefined || p.stock === "") return { clase: "consultar", texto: "Disponibilidad a confirmar", puede: true, max: 99 };
    const s = Number(p.stock);
    if (s <= 0) return { clase: "no", texto: "Agotado", puede: false, max: 0 };
    return { clase: "ok", texto: s <= 3 ? `Últimas ${s} unidades` : "Disponible", puede: true, max: s };
  }

  /* ---------- WhatsApp ---------- */
  function numeroWA() {
    let n = String((CONFIG.contacto && CONFIG.contacto.whatsapp) || "").replace(/\D/g, "");
    if (!n) return "";
    if (n.startsWith("0")) n = "598" + n.slice(1);          // 099 123 456 -> 59899123456
    else if (n.length === 8 && n.startsWith("9")) n = "598" + n; // 99 123 456
    return n;
  }
  function linkWA(texto) {
    const n = numeroWA();
    return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : "";
  }

  /* ---------- carrito ---------- */
  function lineasCarrito() {
    return carrito.map(l => ({ ...l, p: producto(l.id) })).filter(l => l.p && l.p.activo !== false);
  }
  function subtotal() { return lineasCarrito().reduce((s, l) => s + l.p.precio * l.cant, 0); }
  function guardarCarrito() { guardarLS(LS_CARRITO, carrito); pintarContador(); }
  function pintarContador() {
    const n = lineasCarrito().reduce((s, l) => s + l.cant, 0);
    const el = document.getElementById("carrito-n");
    el.textContent = n; el.hidden = n === 0;
  }
  function agregar(id, cant) {
    const p = producto(id); if (!p) return;
    const d = disponibilidad(p); if (!d.puede) return;
    const l = carrito.find(x => x.id === id);
    const actual = l ? l.cant : 0;
    const nueva = Math.min(actual + (cant || 1), d.max);
    if (l) l.cant = nueva; else carrito.push({ id, cant: nueva });
    guardarCarrito();
    toast(nueva > actual ? `Agregaste ${esc(p.nombre)} <a href="#/carrito">Ver carrito</a>` : "No hay más unidades disponibles");
  }
  function cambiarCant(id, delta) {
    const l = carrito.find(x => x.id === id); if (!l) return;
    const p = producto(id); const d = disponibilidad(p);
    l.cant = Math.max(1, Math.min(l.cant + delta, d.max));
    guardarCarrito();
  }
  function quitar(id) { carrito = carrito.filter(x => x.id !== id); guardarCarrito(); }

  let toastT;
  function toast(html) {
    const t = document.getElementById("toast");
    t.innerHTML = html; t.classList.add("visible");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("visible"), 2800);
  }

  /* ---------- piezas de interfaz ---------- */
  const icoMas = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const icoWA = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Z"/></svg>';

  /* fotos de ambientación (Unsplash, licencia libre: unsplash.com/license) */
  function foto(id, w, h) { return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=75&w=${w}${h ? "&h=" + h : ""}`; }
  const FOTOS = {
    portada: "img/ambientacion/portada.jpg",   // generada con Buzzy AI: Aros Flor Roja
    // generadas con Buzzy AI a partir de fotos de Unsplash, con productos JUMA
    aros: "img/ambientacion/aros.jpg",                 // Aros Zana
    pulseras: "img/ambientacion/pulseras.jpg",         // Pulsera Emi
    anillos: "img/ambientacion/anillos.jpg",           // Anillo Nueva York oscuro
    collares: "img/ambientacion/coleccion.jpg",        // Collar Punto de Luz rosa
    regalo: "img/ambientacion/regalo.jpg",             // Esclava María en caja JUMA
    capas: "img/ambientacion/capas.jpg",               // Collar Vale + Collar Pandora
    historia: "img/ambientacion/historia.jpg",         // Brazalete Amanda oro
    historia2: "img/ambientacion/historia-mosaico.jpg" // Collar Pandora
  };
  function imgFoto(clave, w, h, alt, extra) {
    const id = FOTOS[clave];
    // fotos propias (generadas con nuestros productos) se sirven desde img/
    if (id.startsWith("img/")) return `<img src="${id}" alt="${esc(alt || "")}" loading="${extra && extra.eager ? "eager" : "lazy"}" decoding="async">`;
    return `<img src="${foto(id, w, h)}" srcset="${foto(id, Math.round(w / 2), h ? Math.round(h / 2) : 0)} ${Math.round(w / 2)}w, ${foto(id, w, h)} ${w}w" sizes="${extra && extra.sizes || "100vw"}" alt="${esc(alt || "")}" loading="${extra && extra.eager ? "eager" : "lazy"}" decoding="async">`;
  }

  function tarjeta(p) {
    const d = disponibilidad(p);
    const img2 = p.imagenes[1] ? `<img class="alt" src="${esc(p.imagenes[1])}" alt="" loading="lazy" decoding="async">` : "";
    const etiqueta = d.clase === "no" ? '<span class="etiqueta etiqueta--agotado">Agotado</span>'
      : (p.destacado ? '<span class="etiqueta">Favorita</span>' : (d.clase === "ok" && d.max <= 3 ? '<span class="etiqueta">Últimas unidades</span>' : ""));
    return `<article class="tarjeta">
      <div class="tarjeta__img">
        <a href="${urlProducto(p)}" aria-label="${esc(p.nombre)}"><img src="${esc(p.imagenes[0])}" alt="${esc(p.nombre)}" loading="lazy" decoding="async">${img2}</a>
        ${etiqueta}
        <button class="agregar-mini" data-agregar="${esc(p.id)}" aria-label="Agregar ${esc(p.nombre)} al carrito" ${d.puede ? "" : "disabled"}>${icoMas}</button>
      </div>
      <div class="tarjeta__info">
        <a class="tarjeta__nombre" href="${urlProducto(p)}">${esc(p.nombre)}</a>
        <span class="precio">${precio(p.precio)}</span>
      </div>
    </article>`;
  }

  function ornamento(t) { return `<div class="ornamento"><span>${esc(t)}</span></div>`; }

  function filaProductos(titulo, lista, link, linkTexto) {
    if (!lista.length) return "";
    return `<section class="fila">
      <div class="fila__cabeza"><h2>${esc(titulo)}</h2><a class="subrayado" href="${link}">${esc(linkTexto)}</a></div>
      <div class="carrusel" tabindex="0" aria-label="${esc(titulo)}">${lista.map(tarjeta).join("")}</div>
    </section>`;
  }

  function mosaico(items, cols) {
    return `<section class="mosaico mosaico--${cols}">${items.map(it => `
      <a class="mosaico__item" href="${it.href}"${it.externo ? ' target="_blank" rel="noopener"' : ""}>
        ${imgFoto(it.foto, cols === 4 ? 720 : 900, cols === 4 ? 900 : 1000, it.alt, { sizes: cols === 4 ? "(max-width: 700px) 50vw, 25vw" : "(max-width: 700px) 100vw, 33vw" })}
        <span class="mosaico__txt"><strong>${esc(it.titulo)}</strong><span class="subrayado">${esc(it.link)}</span></span>
      </a>`).join("")}</section>`;
  }

  /* ---------- vistas ---------- */
  function vistaInicio() {
    const t = CONFIG.tienda || {};
    const activos = PRODUCTOS.filter(p => p.activo !== false);
    const favoritas = activos.filter(p => p.destacado).concat(activos.filter(p => !p.destacado));
    const cats = categoriasConProductos();
    const conteo = c => activos.filter(p => p.categoria === c).length;
    const catPrincipal = cats.slice().sort((a, b) => conteo(b) - conteo(a))[0];
    const fotoCat = { Aros: "aros", Pulseras: "pulseras", Anillos: "anillos", Collares: "collares" };
    const tiles = cats.slice(0, 3).map(c => ({ href: `#/catalogo?cat=${encodeURIComponent(c)}`, foto: fotoCat[c] || "capas", titulo: c, link: `Ver ${c.toLowerCase()}`, alt: c }));
    tiles.push({ href: "#/catalogo", foto: "collares", titulo: "Toda la colección", link: "Ver todo", alt: "Collares dorados" });
    const wa = linkWA((CONFIG.contacto && CONFIG.contacto.mensajeWhatsapp) || "¡Hola!");
    const waRegalo = linkWA("¡Hola JUMA Joyas! Estoy buscando una joya para regalar, ¿me ayudan a elegir?");
    return `
      <section class="portada">
        ${imgFoto("portada", 2000, 1100, "Mujer con los Aros Flor Roja de JUMA", { eager: true })}
        <div class="portada__texto">
          <h1>Joyas que transforman</h1>
          <p>${esc(t.eslogan || "")}</p>
          <a class="subrayado" href="#/catalogo">Ver la colección</a>
        </div>
      </section>

      ${filaProductos("Nuestras favoritas", favoritas.slice(0, 8), "#/catalogo", "Ver todo")}

      ${mosaico(tiles, 4)}

      ${catPrincipal ? filaProductos(`${catPrincipal} para todos los días`, activos.filter(p => p.categoria === catPrincipal), `#/catalogo?cat=${encodeURIComponent(catPrincipal)}`, `Ver ${catPrincipal.toLowerCase()}`) : ""}

      ${mosaico([
        { href: waRegalo || "#/contacto", externo: !!waRegalo, foto: "regalo", titulo: "Para regalar", link: "Te ayudamos a elegir", alt: "Manos sosteniendo una caja de regalo" },
        { href: "#/catalogo", foto: "capas", titulo: "Combiná y superponé", link: "Armá tu look", alt: "Collares dorados superpuestos" },
        { href: "#/historia", foto: "historia2", titulo: "Nuestra historia", link: "Conocenos", alt: "Collar dorado delicado" }
      ], 3)}

      <section class="historia" id="historia">
        <div class="historia__img">${imgFoto("historia", 1000, 1200, "Mujer con collares dorados", { sizes: "(max-width: 800px) 100vw, 50vw" })}</div>
        <div class="historia__txt">
          <img src="img/logo-mark.svg" alt="" width="64" height="64">
          <h2>Hecho con cariño, pensado para vos</h2>
          <p>${esc(t.presentacion || "")}</p>
          <div class="pasos">
            <div class="paso"><span class="paso__n">01</span><div><strong>Elegí tus joyas</strong><p>Agregalas al carrito desde el catálogo.</p></div></div>
            <div class="paso"><span class="paso__n">02</span><div><strong>Enviá tu pedido</strong><p>Indicá cómo querés recibirlo y te confirmamos por WhatsApp.</p></div></div>
            <div class="paso"><span class="paso__n">03</span><div><strong>Pagás y te lo enviamos</strong><p>Pagás por transferencia o Mercado Pago y, una vez acreditado, despachamos tu pedido.</p></div></div>
          </div>
          <div class="historia__acciones">
            <a class="btn" href="#/catalogo">Comprar ahora</a>
            ${wa ? `<a class="btn btn--claro" href="${wa}" target="_blank" rel="noopener">Escribinos</a>` : ""}
          </div>
        </div>
      </section>`;
  }

  function categoriasConProductos() {
    const usadas = new Set(PRODUCTOS.filter(p => p.activo !== false).map(p => p.categoria));
    const orden = (CONFIG.categorias || []).filter(c => usadas.has(c));
    usadas.forEach(c => { if (!orden.includes(c)) orden.push(c); });
    return orden;
  }

  const estadoCatalogo = { q: "", cat: "", orden: "destacados" };

  function vistaCatalogo(params) {
    estadoCatalogo.cat = params.get("cat") || "";
    if (params.has("q")) estadoCatalogo.q = params.get("q");
    const cats = categoriasConProductos();
    return `
      <div class="contenedor">
        <nav class="migas" aria-label="Ruta"><a href="#/">Inicio</a> / Joyas</nav>
        <div class="cabeza-pagina cabeza-pagina--izq"><h1 id="cat-titulo">${esc(estadoCatalogo.cat || "Todas las joyas")}</h1><p>Joyas delicadas para acompañarte todos los días.</p></div>
        <div class="filtros">
          <div class="filtros__fila">
            <div class="chips" role="group" aria-label="Filtrar por categoría">
              <button class="chip" data-cat="" aria-pressed="${!estadoCatalogo.cat}">Todas</button>
              ${cats.map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${estadoCatalogo.cat === c}">${esc(c)}</button>`).join("")}
            </div>
            <label class="orden"><span class="sr-only">Ordenar</span>
              <select id="ordenar">
                <option value="destacados">Destacados</option>
                <option value="precio-asc">Menor precio</option>
                <option value="precio-desc">Mayor precio</option>
                <option value="nombre">Nombre A–Z</option>
              </select>
            </label>
          </div>
        </div>
        <p class="resultado-n" id="resultado-n"></p>
        <div class="grilla" id="grilla"></div>
        <div class="vacio" id="vacio" hidden>No encontramos joyas con esa búsqueda. <button class="enlace" style="background:none;border:0;cursor:pointer" id="limpiar">Ver todas</button></div>
      </div>`;
  }

  function filtrarCatalogo() {
    const q = normalizar(estadoCatalogo.q.trim());
    let lista = PRODUCTOS.filter(p => p.activo !== false)
      .filter(p => !estadoCatalogo.cat || p.categoria === estadoCatalogo.cat)
      .filter(p => !q || normalizar(p.nombre).includes(q));
    const o = estadoCatalogo.orden;
    if (o === "precio-asc") lista.sort((a, b) => a.precio - b.precio);
    else if (o === "precio-desc") lista.sort((a, b) => b.precio - a.precio);
    else if (o === "nombre") lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    else lista.sort((a, b) => (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0));
    document.getElementById("grilla").innerHTML = lista.map(tarjeta).join("");
    document.getElementById("vacio").hidden = lista.length > 0;
    document.getElementById("resultado-n").textContent = lista.length === 1 ? "1 joya" : `${lista.length} joyas`;
    document.querySelectorAll(".chip").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.cat === estadoCatalogo.cat)));
    document.getElementById("cat-titulo").textContent = estadoCatalogo.cat || "Todas las joyas";
  }

  function montarCatalogo() {
    const input = document.getElementById("busqueda-q");   // buscador de la cabecera
    const sel = document.getElementById("ordenar");
    sel.value = estadoCatalogo.orden;
    input.value = estadoCatalogo.q;
    sel.addEventListener("change", () => { estadoCatalogo.orden = sel.value; filtrarCatalogo(); });
    document.querySelectorAll(".chip").forEach(b => b.addEventListener("click", () => { estadoCatalogo.cat = b.dataset.cat; filtrarCatalogo(); }));
    document.getElementById("limpiar").addEventListener("click", () => { estadoCatalogo.q = ""; estadoCatalogo.cat = ""; input.value = ""; filtrarCatalogo(); });
    filtrarCatalogo();
  }

  function vistaProducto(id) {
    const p = producto(id);
    if (!p || p.activo === false) return `<div class="contenedor vacio"><h1>No encontramos esta joya</h1><p><a class="btn" href="#/catalogo">Volver al catálogo</a></p></div>`;
    const d = disponibilidad(p);
    const varias = p.imagenes.length > 1;
    const relacionados = PRODUCTOS.filter(x => x.id !== p.id && x.activo !== false && x.categoria === p.categoria).slice(0, 4);
    const consulta = linkWA(`¡Hola JUMA Joyas! Quería consultar por: ${p.nombre} (${precio(p.precio)}).\n${location.href}`);
    const fila = (titulo, valor, falta) => `<div><dt>${titulo}</dt><dd>${valor ? esc(valor) : pendiente(falta)}</dd></div>`;
    return `
      <div class="contenedor">
        <nav class="migas" aria-label="Ruta"><a href="#/">Inicio</a> / <a href="#/catalogo">Catálogo</a> / <a href="#/catalogo?cat=${encodeURIComponent(p.categoria)}">${esc(p.categoria)}</a></nav>
        <div class="producto">
          <div class="galeria" data-i="0">
            <div class="galeria__principal">
              <img id="galeria-img" src="${esc(p.imagenes[0])}" alt="${esc(p.nombre)}, foto 1">
              ${varias ? `
                <button class="galeria__flecha galeria__flecha--izq" data-dir="-1" aria-label="Foto anterior"><svg viewBox="0 0 24 24" width="20" height="20"><path d="m15 5-7 7 7 7" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></button>
                <button class="galeria__flecha galeria__flecha--der" data-dir="1" aria-label="Foto siguiente"><svg viewBox="0 0 24 24" width="20" height="20"><path d="m9 5 7 7-7 7" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></button>
                <span class="galeria__contador" id="galeria-n">1 / ${p.imagenes.length}</span>` : ""}
            </div>
            ${varias ? `<div class="galeria__miniaturas">${p.imagenes.map((src, i) => `<button data-i="${i}" aria-label="Ver foto ${i + 1}" aria-current="${i === 0}"><img src="${esc(src)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
          </div>
          <div class="ficha">
            <a class="ficha__cat" href="#/catalogo?cat=${encodeURIComponent(p.categoria)}">${esc(p.categoria)}</a>
            <h1>${esc(p.nombre)}</h1>
            <div class="ficha__precio">${precio(p.precio)}</div>
            <span class="disp disp--${d.clase}">${d.texto}</span>
            <p class="ficha__desc">${esc(p.descripcion)}</p>
            <div class="ficha__acciones">
              <div class="ficha__compra">
                <div class="cantidad" aria-label="Cantidad">
                  <button type="button" data-cant="-1" aria-label="Restar uno">−</button>
                  <span id="cant" aria-live="polite">1</span>
                  <button type="button" data-cant="1" aria-label="Sumar uno">+</button>
                </div>
                <button class="btn" id="agregar" ${d.puede ? "" : "disabled"}>${d.puede ? "Agregar al carrito" : "Agotado"}</button>
              </div>
              ${consulta ? `<a class="btn btn--wa" href="${consulta}" target="_blank" rel="noopener">${icoWA} Consultar por WhatsApp</a>` : (pendientesVisibles() ? `<span class="pendiente" style="text-align:center;padding:10px">Botón de WhatsApp: falta cargar el número en la configuración</span>` : "")}
            </div>
            <dl class="detalles">
              ${fila("Categoría", p.categoria)}
              ${fila("Color / tono", p.color, "Por completar")}
              ${fila("Material", p.material, "Por completar")}
              ${fila("Medidas", p.medidas, "Por completar")}
              ${fila("Stock", (p.stock === null || p.stock === undefined || p.stock === "") ? "" : String(p.stock), "Por completar")}
            </dl>
          </div>
        </div>
        ${relacionados.length ? `<section class="relacionados"><div class="seccion__titulo"><h2>También te puede gustar</h2></div><div class="grilla">${relacionados.map(tarjeta).join("")}</div></section>` : ""}
      </div>`;
  }

  function montarProducto(id) {
    const p = producto(id); if (!p) return;
    document.title = `${p.nombre} · JUMA Joyas`;
    let i = 0, cant = 1;
    const img = document.getElementById("galeria-img");
    function ir(n) {
      i = (n + p.imagenes.length) % p.imagenes.length;
      img.src = p.imagenes[i]; img.alt = `${p.nombre}, foto ${i + 1}`;
      const c = document.getElementById("galeria-n"); if (c) c.textContent = `${i + 1} / ${p.imagenes.length}`;
      document.querySelectorAll(".galeria__miniaturas button").forEach((b, k) => b.setAttribute("aria-current", String(k === i)));
    }
    document.querySelectorAll(".galeria__flecha").forEach(b => b.addEventListener("click", () => ir(i + Number(b.dataset.dir))));
    document.querySelectorAll(".galeria__miniaturas button").forEach(b => b.addEventListener("click", () => ir(Number(b.dataset.i))));
    // deslizar con el dedo
    let x0 = null;
    img.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
    img.addEventListener("touchend", e => { if (x0 === null || p.imagenes.length < 2) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) ir(i + (dx < 0 ? 1 : -1)); x0 = null; });
    const max = disponibilidad(p).max;
    document.querySelectorAll("[data-cant]").forEach(b => b.addEventListener("click", () => {
      cant = Math.max(1, Math.min(cant + Number(b.dataset.cant), Math.max(1, max)));
      document.getElementById("cant").textContent = cant;
    }));
    const btn = document.getElementById("agregar");
    if (btn) btn.addEventListener("click", () => agregar(p.id, cant));
  }

  function vistaCarrito() {
    const lineas = lineasCarrito();
    if (!lineas.length) return `<div class="contenedor"><div class="cabeza-pagina"><h1>Tu carrito</h1></div><div class="vacio"><p>Tu carrito está vacío.</p><a class="btn" href="#/catalogo">Ver catálogo</a></div></div>`;
    const st = subtotal();
    return `
      <div class="contenedor">
        <div class="cabeza-pagina"><h1>Tu carrito</h1></div>
        <div class="carrito">
          <div>
            ${lineas.map(l => `
              <div class="linea-carrito">
                <a href="${urlProducto(l.p)}"><img src="${esc(l.p.imagenes[0])}" alt="${esc(l.p.nombre)}" loading="lazy"></a>
                <div>
                  <a class="linea-carrito__nombre" href="${urlProducto(l.p)}">${esc(l.p.nombre)}</a>
                  <div class="linea-carrito__meta">${precio(l.p.precio)} c/u</div>
                </div>
                <div class="linea-carrito__der">
                  <div class="cantidad">
                    <button data-menos="${esc(l.id)}" aria-label="Restar uno">−</button>
                    <span>${l.cant}</span>
                    <button data-mas="${esc(l.id)}" aria-label="Sumar uno">+</button>
                  </div>
                  <strong class="precio">${precio(l.p.precio * l.cant)}</strong>
                  <button class="quitar" data-quitar="${esc(l.id)}">Quitar</button>
                </div>
              </div>`).join("")}
            <p style="margin-top:18px"><a class="enlace" href="#/catalogo">← Seguir comprando</a></p>
          </div>
          <aside class="resumen">
            <h2>Resumen</h2>
            <div class="resumen__fila"><span>Subtotal</span><span>${precio(st)}</span></div>
            <div class="resumen__fila"><span>Envío</span><span>Se elige en el siguiente paso</span></div>
            <div class="resumen__fila resumen__fila--total"><span>Total</span><span>${precio(st)}</span></div>
            <p class="resumen__nota">Precios en pesos uruguayos (UYU).</p>
            <a class="btn btn--bloque" href="#/pedido">Continuar con el pedido</a>
          </aside>
        </div>
        <div class="barra-movil"><div>Subtotal<strong>${precio(st)}</strong></div><a class="btn" href="#/pedido">Continuar</a></div>
      </div>`;
  }

  function montarCarrito() {
    $app.querySelectorAll("[data-mas]").forEach(b => b.addEventListener("click", () => { cambiarCant(b.dataset.mas, 1); render(); }));
    $app.querySelectorAll("[data-menos]").forEach(b => b.addEventListener("click", () => { cambiarCant(b.dataset.menos, -1); render(); }));
    $app.querySelectorAll("[data-quitar]").forEach(b => b.addEventListener("click", () => { quitar(b.dataset.quitar); render(); }));
  }

  function enviosActivos() { return (CONFIG.envios || []).filter(e => e.activo !== false); }
  function pagosActivos() { return (CONFIG.pagos || []).filter(e => e.activo !== false); }
  function zonas() { return CONFIG.zonasMontevideo || []; }
  function zonaDeBarrio(b) { return zonas().find(z => (z.barrios || []).includes(b)) || null; }
  function numOnull(v) { return (v === null || v === undefined || v === "") ? null : Number(v); }
  // costo del envío; si la opción usa zonas, depende del barrio elegido
  function costoEnvio(e, st, barrio) {
    if (!e) return null;
    if (CONFIG.envioGratisDesde && st >= CONFIG.envioGratisDesde && e.requiereDireccion) return 0;
    if (e.usaZonas) { const z = zonaDeBarrio(barrio); return z ? numOnull(z.costo) : null; }
    return numOnull(e.costo);
  }
  function textoCosto(c) { return c === null ? "A confirmar" : (c === 0 ? "Sin costo" : precio(c)); }
  function textoCostoOpcion(e, st) {
    if (!e.usaZonas) return textoCosto(costoEnvio(e, st));
    if (CONFIG.envioGratisDesde && st >= CONFIG.envioGratisDesde) return "Sin costo";
    const cs = zonas().map(z => numOnull(z.costo)).filter(c => c !== null);
    return cs.length ? `Desde ${precio(Math.min(...cs))}` : "Según zona";
  }
  const textoPagoPrevio = () => (CONFIG.textoPagoPrevio || "Primero se paga el pedido. Una vez acreditado el pago, preparamos y despachamos tu envío.");

  function vistaPedido() {
    const lineas = lineasCarrito();
    if (!lineas.length) return vistaCarrito();
    const datos = leerLS(LS_DATOS, {});
    const envios = enviosActivos(), pagos = pagosActivos();
    const st = subtotal();
    const sinWA = !numeroWA();
    return `
      <div class="contenedor">
        <div class="cabeza-pagina"><h1>Finalizar pedido</h1><p>Completá tus datos y te confirmamos por WhatsApp.</p></div>
        <div class="carrito">
          <form class="form" id="form-pedido" novalidate>
            <fieldset>
              <legend>Tus datos</legend>
              <div class="campo"><label for="f-nombre">Nombre y apellido *</label><input id="f-nombre" name="nombre" autocomplete="name" required value="${esc(datos.nombre)}"></div>
              <div class="dos-col">
                <div class="campo"><label for="f-tel">Celular *</label><input id="f-tel" name="telefono" type="tel" inputmode="tel" autocomplete="tel" placeholder="09X XXX XXX" required value="${esc(datos.telefono)}"></div>
                <div class="campo"><label for="f-email">Email (opcional)</label><input id="f-email" name="email" type="email" autocomplete="email" value="${esc(datos.email)}"></div>
              </div>
            </fieldset>
            <fieldset>
              <legend>Entrega</legend>
              ${envios.map((e, k) => `
                <label class="opcion"><input type="radio" name="envio" value="${esc(e.id)}" ${k === 0 ? "checked" : ""}>
                  <span><strong>${esc(e.nombre)}</strong><small>${esc(e.descripcion || "")}</small></span>
                  <span class="opcion__costo">${textoCostoOpcion(e, st)}</span></label>`).join("") || pendiente("Configurar opciones de envío")}
              <div id="direccion" class="form" style="gap:14px" hidden>
                <div class="campo" id="campo-barrio" hidden><label for="f-barrio">Barrio *</label>
                  <select id="f-barrio" name="barrio"><option value="">Elegí tu barrio…</option>
                    ${zonas().map(z => `<optgroup label="${esc(z.nombre)}${numOnull(z.costo) !== null ? " · " + precio(z.costo) : ""}">${(z.barrios || []).slice().sort((a, b) => a.localeCompare(b, "es")).map(b => `<option ${b === datos.barrio ? "selected" : ""}>${esc(b)}</option>`).join("")}</optgroup>`).join("")}
                  </select>
                  <small class="campo__ayuda">El costo del envío depende de la distancia. Si tu barrio no aparece, elegí el más cercano y lo confirmamos.</small>
                </div>
                <div class="dos-col" id="campos-interior">
                  <div class="campo"><label for="f-depto">Departamento *</label><select id="f-depto" name="departamento">${DEPARTAMENTOS.filter(dp => dp !== "Montevideo").map(dp => `<option ${dp === datos.departamento ? "selected" : ""}>${dp}</option>`).join("")}</select></div>
                  <div class="campo"><label for="f-ciudad">Ciudad *</label><input id="f-ciudad" name="ciudad" autocomplete="address-level2" value="${esc(datos.ciudad)}"></div>
                </div>
                <div class="campo"><label for="f-dir">Dirección *</label><input id="f-dir" name="direccion" autocomplete="street-address" placeholder="Calle, número, apto." value="${esc(datos.direccion)}"></div>
              </div>
            </fieldset>
            <fieldset>
              <legend>Forma de pago</legend>
              ${pagos.map((pg, k) => `
                <label class="opcion"><input type="radio" name="pago" value="${esc(pg.id)}" ${k === 0 ? "checked" : ""}>
                  <span><strong>${esc(pg.nombre)}</strong>${pg.instrucciones ? `<small>${esc(pg.instrucciones)}</small>` : ""}</span><span></span></label>`).join("") || pendiente("Configurar medios de pago")}
              <p class="aviso-pago">${esc(textoPagoPrevio())}</p>
            </fieldset>
            <fieldset>
              <legend>Algo más</legend>
              <div class="campo"><label for="f-notas">Notas para tu pedido (opcional)</label><textarea id="f-notas" name="notas" placeholder="Ej.: es para regalo, horario preferido…"></textarea></div>
            </fieldset>
          </form>
          <aside class="resumen">
            <h2>Tu pedido</h2>
            <div class="resumen__items">${lineas.map(l => `<div><span>${l.cant} × ${esc(l.p.nombre)}</span><span>${precio(l.p.precio * l.cant)}</span></div>`).join("")}</div>
            <div class="resumen__fila"><span>Subtotal</span><span>${precio(st)}</span></div>
            <div class="resumen__fila"><span>Envío</span><span id="r-envio">—</span></div>
            <div class="resumen__fila resumen__fila--total"><span>Total</span><span id="r-total">${precio(st)}</span></div>
            <p class="resumen__nota" id="r-nota"></p>
            <button class="btn btn--bloque" type="submit" form="form-pedido">Revisar y enviar pedido</button>
            ${sinWA && pendientesVisibles() ? `<p class="resumen__nota"><span class="pendiente">Falta configurar el número de WhatsApp de la tienda para recibir pedidos.</span></p>` : ""}
          </aside>
        </div>
        <div class="barra-movil"><div>Total<strong id="b-total">${precio(st)}</strong></div><button class="btn" type="submit" form="form-pedido">Continuar</button></div>
      </div>`;
  }

  function montarPedido() {
    const form = document.getElementById("form-pedido"); if (!form) return montarCarrito();
    const st = subtotal();
    function actualizar() {
      const sel = form.querySelector("[name=envio]:checked");
      const e = sel ? enviosActivos().find(x => x.id === sel.value) : null;
      const conZonas = !!(e && e.usaZonas);
      document.getElementById("direccion").hidden = !(e && e.requiereDireccion);
      document.getElementById("campo-barrio").hidden = !conZonas;
      document.getElementById("campos-interior").hidden = conZonas;
      const barrio = form.elements.barrio.value;
      const faltaBarrio = conZonas && !barrio;
      const c = costoEnvio(e, st, barrio);
      document.getElementById("r-envio").textContent = !e ? "—" : (faltaBarrio ? "Elegí tu barrio" : textoCosto(c));
      const total = st + (c || 0);
      document.getElementById("r-total").textContent = precio(total) + (c === null && e ? " + envío" : "");
      document.getElementById("b-total").textContent = precio(total);
      document.getElementById("r-nota").textContent = c === null && e && !faltaBarrio ? "El costo de envío se confirma por WhatsApp." : "Precios en pesos uruguayos (UYU).";
    }
    form.addEventListener("change", actualizar);
    actualizar();
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      const fd = new FormData(form);
      const datos = Object.fromEntries(fd.entries());
      const envio = enviosActivos().find(x => x.id === datos.envio);
      const pago = pagosActivos().find(x => x.id === datos.pago);
      const conDir = !!(envio && envio.requiereDireccion);
      const conZonas = conDir && !!envio.usaZonas;
      const requeridos = ["nombre", "telefono"].concat(conDir ? (conZonas ? ["barrio", "direccion"] : ["ciudad", "direccion"]) : []);
      let primero = null;
      form.querySelectorAll(".campo__error").forEach(x => x.remove());
      form.querySelectorAll(".campo--error").forEach(x => x.classList.remove("campo--error"));
      requeridos.forEach(k => {
        const inp = form.elements[k];
        let ok = String(datos[k] || "").trim().length > 1;
        if (k === "telefono") ok = String(datos[k] || "").replace(/\D/g, "").length >= 8;
        if (!ok) {
          const campo = inp.closest(".campo"); campo.classList.add("campo--error");
          campo.insertAdjacentHTML("beforeend", `<span class="campo__error">${k === "telefono" ? "Ingresá un celular válido" : (k === "barrio" ? "Elegí tu barrio" : "Completá este campo")}</span>`);
          primero = primero || inp;
        }
      });
      if (!envio || !pago) { toast("Elegí una forma de entrega y de pago"); return; }
      if (primero) { primero.focus(); return; }
      const guardado = { nombre: datos.nombre, telefono: datos.telefono, email: datos.email, direccion: datos.direccion, barrio: datos.barrio };
      if (!conZonas) { guardado.departamento = datos.departamento; guardado.ciudad = datos.ciudad; }
      guardarLS(LS_DATOS, guardado);
      if (conZonas) { datos.departamento = "Montevideo"; datos.ciudad = datos.barrio; }
      const zona = conZonas ? zonaDeBarrio(datos.barrio) : null;
      const c = costoEnvio(envio, st, datos.barrio);
      const f = new Date();
      const codigo = "JUMA-" + f.toISOString().slice(2, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
      pedidoActual = { codigo, datos, envio, zona, pago, costoEnvio: c, lineas: lineasCarrito().map(l => ({ nombre: l.p.nombre, cant: l.cant, precio: l.p.precio })), subtotal: st };
      location.hash = "#/confirmar";
    });
  }

  function mensajePedido(o) {
    const L = [];
    L.push(`¡Hola JUMA Joyas! Quiero hacer este pedido:`);
    L.push(`Pedido ${o.codigo}`, "");
    o.lineas.forEach(l => L.push(`• ${l.cant} × ${l.nombre} — ${precio(l.precio * l.cant)}`));
    L.push("", `Subtotal: ${precio(o.subtotal)}`);
    L.push(`Entrega: ${o.envio.nombre}${o.zona ? " · " + o.zona.nombre : ""} (${textoCosto(o.costoEnvio)})`);
    if (o.envio.requiereDireccion) L.push(`Dirección: ${o.datos.direccion}, ${o.datos.ciudad}, ${o.datos.departamento}`);
    L.push(`Total: ${precio(o.subtotal + (o.costoEnvio || 0))}${o.costoEnvio === null ? " + envío a confirmar" : ""}`);
    L.push(`Pago: ${o.pago.nombre}`, "");
    L.push(`Nombre: ${o.datos.nombre}`, `Celular: ${o.datos.telefono}`);
    if (o.datos.email) L.push(`Email: ${o.datos.email}`);
    if (o.datos.notas) L.push(`Notas: ${o.datos.notas}`);
    L.push("", "Quedo a la espera de los datos para pagar.");
    return L.join("\n");
  }

  function vistaConfirmar() {
    const o = pedidoActual;
    if (!o) return vistaCarrito();
    const wa = linkWA(mensajePedido(o));
    const total = o.subtotal + (o.costoEnvio || 0);
    return `
      <div class="contenedor"><div class="confirmacion">
        ${ornamento("Último paso")}
        <h1>Enviá tu pedido por WhatsApp</h1>
        <span class="confirmacion__codigo">${esc(o.codigo)}</span>
        <p>Al tocar el botón se abre WhatsApp con tu pedido ya escrito. Te respondemos con los datos para pagar por ${esc(o.pago.nombre)}.</p>
        <ol class="pasos-pedido">
          <li><strong>Enviás el pedido</strong> por WhatsApp.</li>
          <li><strong>Pagás</strong> por transferencia o Mercado Pago.</li>
          <li><strong>Una vez acreditado el pago</strong>, despachamos tu pedido.</li>
        </ol>
        <div class="resumen">
          <div class="resumen__items">${o.lineas.map(l => `<div><span>${l.cant} × ${esc(l.nombre)}</span><span>${precio(l.precio * l.cant)}</span></div>`).join("")}</div>
          <div class="resumen__fila"><span>Entrega: ${esc(o.envio.nombre)}${o.zona ? " · " + esc(o.zona.nombre) : ""}</span><span>${textoCosto(o.costoEnvio)}</span></div>
          <div class="resumen__fila"><span>Pago</span><span>${esc(o.pago.nombre)}</span></div>
          <div class="resumen__fila resumen__fila--total"><span>Total</span><span>${precio(total)}${o.costoEnvio === null ? " + envío" : ""}</span></div>
          ${o.pago.instrucciones ? `<p class="resumen__nota">${esc(o.pago.instrucciones)}</p>` : ""}
        </div>
        <div class="confirmacion__acciones">
          ${wa ? `<a class="btn btn--wa btn--bloque" id="enviar-wa" href="${wa}" target="_blank" rel="noopener">${icoWA} Enviar pedido por WhatsApp</a>`
               : `<span class="pendiente" style="padding:12px">La tienda todavía no cargó su número de WhatsApp. Configuralo en data/config.json o desde /admin.</span>`}
          <a class="btn btn--claro btn--bloque" href="#/pedido">Modificar datos</a>
        </div>
      </div></div>`;
  }

  function montarConfirmar() {
    const b = document.getElementById("enviar-wa");
    if (b) b.addEventListener("click", () => {
      carrito = []; guardarCarrito();
      setTimeout(() => {
        $app.querySelector(".confirmacion__acciones").innerHTML = `<p>¡Gracias! Si WhatsApp no se abrió, <a class="enlace" href="${b.href}" target="_blank" rel="noopener">tocá acá</a>.</p><a class="btn btn--claro btn--bloque" href="#/catalogo">Volver a la tienda</a>`;
      }, 300);
    });
  }

  function vistaContacto() {
    const c = CONFIG.contacto || {}, r = CONFIG.redes || {};
    const ico = {
      wa: icoWA,
      mail: '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" fill="none" stroke-width="1.4"/><path d="m4 7 8 6 8-6" stroke="currentColor" fill="none" stroke-width="1.4"/></svg>',
      ig: '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4" y="4" width="16" height="16" rx="5" stroke="currentColor" fill="none" stroke-width="1.4"/><circle cx="12" cy="12" r="3.6" stroke="currentColor" fill="none" stroke-width="1.4"/><circle cx="17" cy="7" r="1" fill="currentColor"/></svg>',
      fb: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M13.5 20v-7h2.4l.4-2.8h-2.8V8.5c0-.8.3-1.4 1.4-1.4h1.5V4.6c-.3 0-1.1-.1-2.1-.1-2.2 0-3.6 1.3-3.6 3.7v2h-2.4V13h2.4v7" stroke="currentColor" fill="none" stroke-width="1.3"/></svg>',
      tt: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M14 4v10.5a3.5 3.5 0 1 1-3-3.46M14 4c.5 2.3 2 3.6 4.5 3.8" stroke="currentColor" fill="none" stroke-width="1.4" stroke-linecap="round"/></svg>',
      pin: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" stroke="currentColor" fill="none" stroke-width="1.4"/><circle cx="12" cy="10" r="2.3" stroke="currentColor" fill="none" stroke-width="1.4"/></svg>',
      reloj: '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="8" stroke="currentColor" fill="none" stroke-width="1.4"/><path d="M12 8v4l3 2" stroke="currentColor" fill="none" stroke-width="1.4" stroke-linecap="round"/></svg>'
    };
    const items = [
      { k: "wa", t: "WhatsApp", v: c.whatsapp, href: linkWA(c.mensajeWhatsapp || "¡Hola!") },
      { k: "mail", t: "Email", v: c.email, href: c.email ? "mailto:" + c.email : "" },
      { k: "ig", t: "Instagram", v: r.instagram, href: urlRed("instagram", r.instagram) },
      { k: "fb", t: "Facebook", v: r.facebook, href: urlRed("facebook", r.facebook) },
      { k: "tt", t: "TikTok", v: r.tiktok, href: urlRed("tiktok", r.tiktok) },
      { k: "pin", t: "Ubicación / retiro", v: c.ubicacion },
      { k: "reloj", t: "Horario de atención", v: c.horario }
    ].filter(x => x.v || pendientesVisibles());
    return `
      <div class="contenedor"><div class="contacto">
        <div class="cabeza-pagina">${ornamento("Hablemos")}<h1>Contacto</h1><p>¿Tenés dudas sobre una joya, un regalo o tu pedido? Escribinos.</p></div>
        <div class="contacto__lista">
          ${items.map(x => {
            const cuerpo = `<span class="contacto__icono">${ico[x.k]}</span><span><small>${x.t}</small>${x.v ? esc(x.v) : pendiente("Por completar")}</span>`;
            return x.v && x.href ? `<a class="contacto__item" href="${esc(x.href)}" target="_blank" rel="noopener">${cuerpo}</a>` : `<div class="contacto__item">${cuerpo}</div>`;
          }).join("")}
        </div>
      </div></div>`;
  }

  function urlRed(red, v) {
    if (!v) return "";
    if (/^https?:\/\//.test(v)) return v;
    const u = v.replace(/^@/, "");
    return { instagram: "https://instagram.com/", facebook: "https://facebook.com/", tiktok: "https://tiktok.com/@" }[red] + u;
  }

  /* ---------- elementos globales ---------- */
  function pintarGlobales() {
    const wa = document.getElementById("wa-flotante");
    const link = linkWA((CONFIG.contacto && CONFIG.contacto.mensajeWhatsapp) || "¡Hola!");
    if (link) { wa.href = link; wa.target = "_blank"; wa.rel = "noopener"; wa.hidden = false; }

    const r = CONFIG.redes || {};
    const redes = [["Instagram", "instagram"], ["Facebook", "facebook"], ["TikTok", "tiktok"]].filter(([, k]) => r[k]);
    document.getElementById("pie-redes").innerHTML = `<h3>Seguinos</h3>` +
      (redes.length ? redes.map(([n, k]) => `<a href="${esc(urlRed(k, r[k]))}" target="_blank" rel="noopener">${n}</a>`).join("") : pendiente("Redes por completar")) +
      (link ? `<a href="${link}" target="_blank" rel="noopener">WhatsApp</a>` : "");

    const faltan = [];
    if (!numeroWA()) faltan.push("número de WhatsApp");
    if (!redes.length) faltan.push("redes sociales");
    if (PRODUCTOS.some(p => !p.material || !p.medidas || p.stock === null || p.stock === undefined)) faltan.push("materiales, medidas y stock de productos");
    if (enviosActivos().some(e => e.usaZonas ? zonas().some(z => numOnull(z.costo) === null) : numOnull(e.costo) === null)) faltan.push("costos de envío");
    const aviso = document.getElementById("aviso-config");
    if (pendientesVisibles() && faltan.length) { aviso.textContent = "Modo configuración · Falta completar: " + faltan.join(", ") + "."; aviso.hidden = false; }
  }

  /* ---------- rutas ---------- */
  function render() {
    const h = location.hash.replace(/^#/, "") || "/";
    const [ruta, query] = h.split("?");
    const params = new URLSearchParams(query || "");
    const partes = ruta.split("/").filter(Boolean);
    let html, montar = null, nav = "", titulo = "JUMA Joyas · Tienda online";
    switch (partes[0]) {
      case undefined: html = vistaInicio(); nav = "inicio"; break;
      case "historia": html = vistaInicio(); nav = "inicio"; break;
      case "catalogo": html = vistaCatalogo(params); montar = montarCatalogo; nav = params.get("cat") || "catalogo"; titulo = `${params.get("cat") || "Catálogo"} · JUMA Joyas`; break;
      case "producto": { const id = decodeURIComponent(partes[1] || ""); html = vistaProducto(id); montar = () => montarProducto(id); nav = "catalogo"; break; }
      case "carrito": html = vistaCarrito(); montar = montarCarrito; titulo = "Carrito · JUMA Joyas"; break;
      case "pedido": html = vistaPedido(); montar = montarPedido; titulo = "Finalizar pedido · JUMA Joyas"; break;
      case "confirmar": html = vistaConfirmar(); montar = pedidoActual ? montarConfirmar : montarCarrito; titulo = "Confirmar pedido · JUMA Joyas"; break;
      case "contacto": html = vistaContacto(); nav = "contacto"; titulo = "Contacto · JUMA Joyas"; break;
      default: html = vistaInicio(); nav = "inicio";
    }
    $app.innerHTML = html;
    document.title = titulo;
    document.body.classList.toggle("con-barra", !!$app.querySelector(".barra-movil"));
    document.body.classList.toggle("sin-wa", ["pedido", "confirmar"].includes(partes[0]));
    document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("activo", a.dataset.nav === nav));
    if (montar) montar();
  }

  let rutaPrevia = "";
  function alCambiarRuta() {
    const base = location.hash.split("?")[0];
    if (base !== "#/catalogo") { estadoCatalogo.q = ""; document.getElementById("busqueda-q").value = ""; }
    render();
    if (base === "#/historia") document.getElementById("historia").scrollIntoView();
    else if (base !== rutaPrevia) window.scrollTo(0, 0);
    rutaPrevia = base;
    cerrarMenu();
    document.getElementById("toast").classList.remove("visible");
  }

  /* ---------- menú móvil ---------- */
  const menuBtn = document.getElementById("menu-btn"), nav = document.getElementById("nav");
  function cerrarMenu() { nav.classList.remove("abierto"); menuBtn.setAttribute("aria-expanded", "false"); }
  menuBtn.addEventListener("click", () => { const a = nav.classList.toggle("abierto"); menuBtn.setAttribute("aria-expanded", String(a)); });

  // buscador de la cabecera
  document.getElementById("busqueda").addEventListener("submit", e => {
    e.preventDefault();
    const q = document.getElementById("busqueda-q").value.trim();
    estadoCatalogo.cat = "";
    location.hash = "#/catalogo" + (q ? "?q=" + encodeURIComponent(q) : "");
  });
  // en el catálogo, el buscador filtra mientras se escribe
  document.getElementById("busqueda-q").addEventListener("input", e => {
    if (!document.getElementById("grilla")) return;
    estadoCatalogo.q = e.target.value; filtrarCatalogo();
  });

  // botón "+" de las tarjetas (delegado)
  $app.addEventListener("click", e => {
    const b = e.target.closest("[data-agregar]");
    if (b) { e.preventDefault(); agregar(b.dataset.agregar, 1); }
  });

  /* ---------- arranque ---------- */
  Promise.all([
    fetch("data/config.json", { cache: "no-cache" }).then(r => r.json()),
    fetch("data/productos.json", { cache: "no-cache" }).then(r => r.json())
  ]).then(([cfg, prod]) => {
    CONFIG = cfg || {};
    PRODUCTOS = ((prod && prod.productos) || []).filter(p => p && p.id && Array.isArray(p.imagenes) && p.imagenes.length)
      .map(p => ({ ...p, precio: Number(p.precio) || 0 }));
    pintarContador();
    pintarGlobales();
    window.addEventListener("hashchange", alCambiarRuta);
    alCambiarRuta();
  }).catch(err => {
    console.error(err);
    $app.innerHTML = `<div class="contenedor vacio"><p>No pudimos cargar la tienda. Si estás abriendo el archivo directamente, usá el servidor local (ver LEEME.md).</p></div>`;
  });
})();
