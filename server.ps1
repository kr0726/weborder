# Lightweight HTTP Server in PowerShell with CSV logging
$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Prefixes.Add("http://localhost:$port/")

Write-Host "--------------------------------------------------"
Write-Host " 注文・整理券管理システム ローカルWebサーバー"
Write-Host "--------------------------------------------------"

try {
    $listener.Start()
    Write-Host "サーバーが正常に起動しました。" -ForegroundColor Green
    Write-Host "ブラウザで以下のURLを開いてください：" -ForegroundColor Cyan
    Write-Host "👉 http://localhost:$port" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "※ 終了するには、このウインドウで [Ctrl + C] を押すか、"
    Write-Host "   タスク管理からタスクを停止してください。"
    Write-Host "--------------------------------------------------"

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $path = $request.Url.LocalPath
        
        # API Endpoint: log order to CSV spreadsheet
        if ($path -eq "/api/log-order") {
            if ($request.HttpMethod -eq "POST") {
                try {
                    $reader = New-Object System.IO.StreamReader($request.InputStream)
                    $body = $reader.ReadToEnd()
                    $order = ConvertFrom-Json $body
                    
                    # Create orders.csv header if it doesn't exist (UTF-8 BOM matches Excel Japanese double-click)
                    $csvPath = Join-Path (Get-Location) "orders.csv"
                    if (-not (Test-Path $csvPath)) {
                        [System.IO.File]::WriteAllText($csvPath, "注文日時,整理券番号,味付け,数量`r`n", [System.Text.Encoding]::UTF8)
                    }
                    
                    # Log time format (local time)
                    $timeStr = [DateTime]::Now.ToString("yyyy-MM-dd HH:mm:ss")
                    
                    # Append each order detail pack
                    foreach ($item in $order.items) {
                        # Quoting to prevent issues with commas in seasonings list
                        $flavorQuoted = "`"$($item.flavor)`""
                        $line = "$timeStr,$($order.formattedId),$flavorQuoted,$($item.qty)"
                        Add-Content -Path $csvPath -Value $line -Encoding utf8
                    }
                    
                    $response.StatusCode = 200
                    $response.ContentType = "text/plain; charset=utf-8"
                    $resBytes = [System.Text.Encoding]::UTF8.GetBytes("Logged successfully")
                    $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
                } catch {
                    $response.StatusCode = 500
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Error logging: $_")
                    $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                }
            } else {
                $response.StatusCode = 405
            }
            $response.Close()
            continue
        }

        if ($path -eq "/") { $path = "/index.html" }
        
        # Prevent directory traversal
        $normalizedPath = $path.Replace("\", "/").TrimStart('/')
        $filePath = Join-Path (Get-Location) $normalizedPath
        
        # Verify file exists and is within current directory
        $currentDir = (Get-Location).Path
        if ($filePath.StartsWith($currentDir) -and (Test-Path $filePath -PathType Leaf)) {
            $content = [System.IO.File]::ReadAllBytes($filePath)
            
            # Content Type detection
            $extension = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = "application/octet-stream"
            if ($extension -eq ".html" -or $extension -eq ".htm") { $contentType = "text/html; charset=utf-8" }
            elseif ($extension -eq ".css") { $contentType = "text/css; charset=utf-8" }
            elseif ($extension -eq ".js") { $contentType = "application/javascript; charset=utf-8" }
            elseif ($extension -eq ".json") { $contentType = "application/json; charset=utf-8" }
            elseif ($extension -eq ".csv") { $contentType = "text/csv; charset=utf-8" }
            elseif ($extension -eq ".png") { $contentType = "image/png" }
            elseif ($extension -eq ".jpg" -or $extension -eq ".jpeg") { $contentType = "image/jpeg" }
            elseif ($extension -eq ".ico") { $contentType = "image/x-icon" }
            
            # CORS headers to allow file fetching if needed
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            
            $response.ContentType = $contentType
            $response.ContentLength64 = $content.Length
            $response.OutputStream.Write($content, 0, $content.Length)
        } else {
            $response.StatusCode = 404
            $err = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.ContentType = "text/plain; charset=utf-8"
            $response.ContentLength64 = $err.Length
            $response.OutputStream.Write($err, 0, $err.Length)
        }
        $response.Close()
    }
} catch {
    Write-Error $_
} finally {
    if ($listener) {
        $listener.Close()
    }
}
