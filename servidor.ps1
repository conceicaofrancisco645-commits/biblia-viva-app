# Servidor local do Biblia Viva (Windows PowerShell, sem instalar nada).
# Uso: de dois cliques em "Abrir Biblia Viva.bat". Feche a janela para parar.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$mime = @{
  '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'
  '.json'='application/json; charset=utf-8'; '.svg'='image/svg+xml'; '.png'='image/png'; '.ico'='image/x-icon'
  '.webmanifest'='application/manifest+json'; '.mp3'='audio/mpeg'; '.m4a'='audio/mp4'; '.ogg'='audio/ogg'; '.txt'='text/plain; charset=utf-8'
}
$listener = $null
foreach ($p in 8080..8090) {
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$p/")
    $l.Start(); $listener = $l; $port = $p; break
  } catch { }
}
if (-not $listener) { Write-Host 'Nao foi possivel abrir uma porta entre 8080 e 8090.'; Read-Host 'Enter para sair'; exit 1 }
$url = "http://localhost:$port/"
Write-Host ''
Write-Host "  Biblia Viva rodando em $url" -ForegroundColor Green
Write-Host '  Deixe esta janela aberta enquanto usa o app. Feche-a para parar.'
Write-Host ''
Start-Process $url
$rootFull = [System.IO.Path]::GetFullPath($root)
while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  $res = $ctx.Response
  try {
    $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path.EndsWith('/')) { $path += 'index.html' }
    $file = [System.IO.Path]::GetFullPath((Join-Path $rootFull ($path.TrimStart('/') -replace '/', '\')))
    if (-not $file.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
      $res.StatusCode = 404; $bytes = [System.Text.Encoding]::UTF8.GetBytes('Nao encontrado')
    } else {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      if ($file.EndsWith('service-worker.js')) { $res.AddHeader('Cache-Control', 'no-cache') }
      $bytes = [System.IO.File]::ReadAllBytes($file)
    }
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch { try { $res.StatusCode = 500 } catch { } }
  finally { try { $res.OutputStream.Close() } catch { } }
}
