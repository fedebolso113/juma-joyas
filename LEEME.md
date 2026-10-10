# JUMA Joyas: tienda online

Es una tienda estática: HTML, CSS y JavaScript, sin base de datos ni servidor propio. Carga rápido y se puede publicar gratis en Netlify, Cloudflare Pages o GitHub Pages.

## Estructura

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `css/`, `js/` | El sitio. No hace falta tocarlos. |
| `data/productos.json` | **Productos**: nombre, categoría, precio, descripción, color, material, medidas, stock y fotos. |
| `data/config.json` | **Configuración**: WhatsApp, email, redes, envíos, medios de pago y textos del inicio. |
| `img/productos/` | Fotos de los productos. |
| `img/logo-juma.jpg`, `img/logo-mark.png` | El logo completo y el ícono (las hermanas) que se usa en la cabecera. |
| `admin/` | Panel de administración (Decap CMS). |

## Datos para completar

1. **WhatsApp** (`contacto.whatsapp`): el número que recibe los pedidos. Acepta `099 123 456` o `+598 99 123 456`. Mientras esté vacío, los botones de WhatsApp no aparecen y se muestra un aviso.
2. **Redes** (`redes.instagram`, `facebook`, `tiktok`): el usuario (`@jumajoyas`) o el enlace completo.
3. **Email, ubicación o punto de retiro, y horario.**
4. **Envíos** (`envios`): el costo de cada opción. Si lo dejás vacío, el pedido dice «a confirmar»; con `0` dice «sin costo». Podés agregar o desactivar opciones.
5. **Medios de pago** (`pagos`): en `instrucciones` van, por ejemplo, el banco y el número de cuenta para transferencias. Abitab/RedPagos está desactivado. Para activarlo, cambiá `activo` a `true`.
6. **Productos**: completá `material`, `medidas` y `stock`. Los precios actuales son **provisorios**.
   - Si el stock está vacío, se muestra «Disponibilidad a confirmar».
   - Con `0`, el producto aparece «Agotado» y no se puede comprar.
   - Con un número, ese número limita cuántas unidades se pueden agregar al carrito.
7. Cuando esté todo listo, poné `"mostrarCamposPendientes": false`. Así desaparecen la franja de «Modo configuración» y las etiquetas «Por completar».

## Cómo funciona un pedido

1. La clienta elige productos, que quedan guardados en el carrito de su navegador.
2. Completa nombre, celular, forma de entrega (con dirección si es envío) y medio de pago.
3. Se genera un código de pedido (`JUMA-AAMMDD-XXXX`) y un botón abre WhatsApp con el pedido completo ya escrito.
4. Ustedes confirman el stock y el costo de envío, y mandan los datos de pago.

## Administrar la tienda sin tocar código

**Opción A: panel `/admin`**

Es un formulario web para editar productos, subir fotos, cambiar precios y stock, y modificar la configuración.

El panel ya está configurado para guardar en el repositorio `fedebolso113/juma-joyas`, rama `main`.

1. Subí la carpeta al repositorio de GitHub.
2. Conectá el repositorio a Netlify. No necesita build: el directorio de publicación es la raíz.
3. En GitHub, creá una OAuth App:
   - Entrá a Settings → Developer settings → OAuth Apps → New OAuth App.
   - En «Homepage URL» poné la dirección de tu sitio en Netlify.
   - En «Authorization callback URL» poné `https://api.netlify.com/auth/done`.
   - Guardá el *Client ID* y generá un *Client secret*.
4. En Netlify, abrí la configuración del sitio y buscá «Access & security» → OAuth → Install provider → GitHub. Pegá ahí el Client ID y el Client secret.
5. Entrá a `https://tu-sitio/admin` e iniciá sesión con GitHub. Cada vez que guardes, el sitio se actualiza solo en uno o dos minutos.

**Opción B: editar los JSON directo en GitHub**

Abrí `data/productos.json` en github.com, tocá el lápiz y guardá. Para fotos nuevas, subilas a `img/productos/`.

## Probar en tu computadora

```
powershell -ExecutionPolicy Bypass -File servidor-local.ps1
```

Después abrí http://localhost:8080. Si abrís `index.html` con doble clic, no funciona: el navegador bloquea la lectura de los JSON.

## Integraciones que quedan preparadas

- **WhatsApp**: solo falta el número. No requiere cuenta Business ni API.
- **Mercado Pago**: hoy funciona como medio de pago «te enviamos un link». Para cobrar automáticamente con checkout hace falta:
  - una cuenta de Mercado Pago vendedor (Uruguay) y su *Access Token*;
  - una pequeña función de servidor (por ejemplo, Netlify Functions) que cree la preferencia de pago, porque el token no puede ir en el sitio público.
- **Envíos**: los costos se configuran a mano. Para cotizar automáticamente con DAC, UES u otra agencia se necesita su API o contrato.
- **Dominio**: comprá el `.uy` o `.com.uy` y apuntalo a Netlify.
