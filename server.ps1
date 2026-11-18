param([switch]$NoOpen)
$ErrorActionPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8765
$listener = $null

for ($p = 8765; $p -le 8775; $p++) {
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://127.0.0.1:$p/")
    $l.Start()
    $listener = $l
    $port = $p
    break
  } catch {
    if ($p -eq 8765) {
      # Если порт 8765 уже занят нашим же сервером — просто открываем страницу и выходим
      try {
        $probe = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:8765/icon.svg")
        $probe.Timeout = 1500
        $pr = $probe.GetResponse()
        $pr.Close()
        if (-not $NoOpen) { Start-Process "http://127.0.0.1:8765/" }
        exit 0
      } catch {}
    }
  }
}

if (-not $listener) {
  Write-Host "Failed to start local server on ports 8765-8775."
  if (-not $NoOpen) { Read-Host "Press Enter to exit" }
  exit 1
}

$url = "http://127.0.0.1:$port/"
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  Albion Flip started: $url" -ForegroundColor Green
Write-Host "  Live Killboard /api/kills is active!" -ForegroundColor Green
Write-Host "  Keep this window open while using the site." -ForegroundColor Gray
Write-Host "===============================================" -ForegroundColor Cyan
if (-not $NoOpen) { Start-Process $url }

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $path = $ctx.Request.Url.LocalPath.TrimStart('/')

    if ($path -eq 'api/kills') {
      $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
      $ctx.Response.Headers.Add('Cache-Control', 'no-store')
      if ($ctx.Request.HttpMethod -eq 'OPTIONS') {
        $ctx.Response.StatusCode = 204
        $ctx.Response.Close()
        continue
      }
      try {
        $srv = $ctx.Request.QueryString['server']
        $hostUrl = switch ($srv) {
          'west' { 'https://gameinfo.albiononline.com' }
          'east' { 'https://gameinfo-sgp.albiononline.com' }
          default { 'https://gameinfo-ams.albiononline.com' }
        }
        $req = [System.Net.HttpWebRequest]::Create("$hostUrl/api/gameinfo/events?limit=51&offset=0")
        $req.Timeout = 9000
        $req.ReadWriteTimeout = 9000
        $req.UserAgent = 'AlbionFlip/2.0'
        $resp = $req.GetResponse()
        $sr = New-Object System.IO.StreamReader($resp.GetResponseStream(), [System.Text.Encoding]::UTF8)
        $json = $sr.ReadToEnd()
        $sr.Close()
        $resp.Close()
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
        $ctx.Response.ContentType = 'application/json; charset=utf-8'
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      } catch {
        $ctx.Response.StatusCode = 502
        $err = [System.Text.Encoding]::UTF8.GetBytes('{"error":"upstream failed"}')
        $ctx.Response.ContentType = 'application/json; charset=utf-8'
        $ctx.Response.ContentLength64 = $err.Length
        $ctx.Response.OutputStream.Write($err, 0, $err.Length)
      }
      $ctx.Response.Close()
      continue
    }

    if (-not $path) { $path = 'index.html' }
    $rootPrefix = $root.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    $file = [IO.Path]::GetFullPath((Join-Path $root $path))
    $ctx.Response.Headers.Add('X-Content-Type-Options', 'nosniff')
    if (-not $path.Contains('..') -and $file.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path $file -PathType Leaf)) {
      $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
      $ct = switch ($ext) {
        '.html'        { 'text/html; charset=utf-8' }
        '.css'         { 'text/css; charset=utf-8' }
        '.js'          { 'application/javascript; charset=utf-8' }
        '.svg'         { 'image/svg+xml' }
        '.webmanifest' { 'application/manifest+json; charset=utf-8' }
        '.json'        { 'application/json; charset=utf-8' }
        '.png'         { 'image/png' }
        default        { 'application/octet-stream' }
      }
      $bytes = [IO.File]::ReadAllBytes($file)
      $ctx.Response.ContentType = $ct
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
  } catch {}
}
