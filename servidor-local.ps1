# Servidor local para probar la tienda en tu computadora (Windows).
# Uso:  powershell -ExecutionPolicy Bypass -File servidor-local.ps1
# Luego abrí http://localhost:8080
param([int]$Puerto = 8080)
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$tipos = @{ ".html"="text/html; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".js"="application/javascript; charset=utf-8"; ".json"="application/json; charset=utf-8"; ".yml"="text/yaml; charset=utf-8"; ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".webp"="image/webp"; ".svg"="image/svg+xml"; ".ico"="image/x-icon" }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Puerto/")
$l.Start()
Write-Host "JUMA Joyas en http://localhost:$Puerto  (Ctrl+C para detener)"
while ($l.IsListening) {
  $ctx = $l.GetContext()
  $ruta = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart("/")
  if ($ruta -eq "" -or $ruta.EndsWith("/")) { $ruta += "index.html" }
  $archivo = [IO.Path]::GetFullPath((Join-Path $raiz $ruta))
  try {
    if ($archivo.StartsWith($raiz) -and (Test-Path $archivo -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($archivo)
      $ext = [IO.Path]::GetExtension($archivo).ToLower()
      $ctx.Response.ContentType = if ($tipos[$ext]) { $tipos[$ext] } else { "application/octet-stream" }
      $ctx.Response.Headers.Add("Cache-Control", "no-cache")
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
  } catch { $ctx.Response.StatusCode = 500 }
  $ctx.Response.Close()
}
