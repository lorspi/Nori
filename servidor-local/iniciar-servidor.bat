@echo off
chcp 65001 > nul
echo(
echo ▄▄  ▄▄  ▄▄▄  ▄▄▄▄  ▄▄ 
echo ███▄██ ██▀██ ██▄█▄ ██ 
echo ██ ▀██ ▀███▀ ██ ██ ██ 
echo(
title Nori - Servidor Local / Local Server
powershell -NoProfile -Command "Write-Host ''; Write-Host '  [OK] Servidor iniciado correctamente / Server started successfully' -ForegroundColor Green; Write-Host ''; Write-Host '  >>  Abriendo / Opening http://localhost:8001 ...' -ForegroundColor Cyan; Write-Host ''; Write-Host '  [!] NO CIERRES ESTA VENTANA / DO NOT CLOSE THIS WINDOW' -ForegroundColor Yellow -BackgroundColor DarkRed; Write-Host '      El servidor se detendra si la cierras.' -ForegroundColor Yellow; Write-Host '      The server will stop if you close it.' -ForegroundColor Yellow; Write-Host ''"
powershell -NoProfile -Command "Start-Sleep -Milliseconds 500"
start http://localhost:8001
powershell -NoProfile -Command "$root = Join-Path (Get-Location) 'dist'; $p = 8001; $l = New-Object System.Net.HttpListener; $l.Prefixes.Add(\"http://localhost:$p/\"); $l.Start(); while($l.IsListening) { $c = $l.GetContext(); $req = $c.Request; $res = $c.Response; $path = $req.Url.LocalPath.TrimStart('/'); if ([string]::IsNullOrEmpty($path)) { $path = 'index.html' }; $f = Join-Path $root $path; if (Test-Path $f -PathType Leaf) { $ext = [System.IO.Path]::GetExtension($f).ToLower(); $mime = switch($ext) { '.html' { 'text/html' } '.js' { 'text/javascript' } '.mjs' { 'text/javascript' } '.css' { 'text/css' } '.png' { 'image/png' } '.jpg' { 'image/jpeg' } '.gif' { 'image/gif' } '.webp' { 'image/webp' } '.svg' { 'image/svg+xml' } '.ico' { 'image/x-icon' } '.json' { 'application/json' } '.webmanifest' { 'application/manifest+json' } '.txt' { 'text/plain' } '.woff2' { 'font/woff2' } '.wasm' { 'application/wasm' } default { 'application/octet-stream' } }; $res.ContentType = \"$mime; charset=utf-8\"; $b = [System.IO.File]::ReadAllBytes($f); $res.ContentLength64 = $b.Length; $res.OutputStream.Write($b, 0, $b.Length) } else { $res.StatusCode = 404 }; $res.Close() }"
pause
