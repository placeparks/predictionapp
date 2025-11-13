Write-Host "=== Testing Kalshi Endpoints ===" -ForegroundColor Cyan

# Test 1: Markets endpoint
Write-Host "`n1. Testing /markets?status=open&limit=5" -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/api/kalshi-public/markets?status=open&limit=5" -UseBasicParsing
    $j = $r.Content | ConvertFrom-Json
    Write-Host "   Status: $($r.StatusCode)" -ForegroundColor Green
    Write-Host "   Markets returned: $($j.markets.Count)"
    if ($j.markets.Count -gt 0) {
        Write-Host "   Sample title: $($j.markets[0].title)"
    }
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Series with politics tags
Write-Host "`n2. Testing /series?tags=US Elections,Trump Agenda" -ForegroundColor Yellow
try {
    $tags = "US Elections,Trump Agenda"
    $url = "http://localhost:3000/api/kalshi-public/series?tags=$([System.Web.HttpUtility]::UrlEncode($tags))"
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing
    $j = $r.Content | ConvertFrom-Json
    Write-Host "   Status: $($r.StatusCode)" -ForegroundColor Green
    Write-Host "   Series returned: $($j.series.Count)"
    if ($j.series.Count -gt 0) {
        Write-Host "   Sample ticker: $($j.series[0].ticker)"
        Write-Host "   Sample title: $($j.series[0].title)"
    }
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Series with crypto tags
Write-Host "`n3. Testing /series?tags=BTC,ETH,SOL" -ForegroundColor Yellow
try {
    $tags = "BTC,ETH,SOL"
    $url = "http://localhost:3000/api/kalshi-public/series?tags=$([System.Web.HttpUtility]::UrlEncode($tags))"
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing
    $j = $r.Content | ConvertFrom-Json
    Write-Host "   Status: $($r.StatusCode)" -ForegroundColor Green
    Write-Host "   Series returned: $($j.series.Count)"
    if ($j.series.Count -gt 0) {
        Write-Host "   Sample ticker: $($j.series[0].ticker)"
    }
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Markets by series_ticker (if we got one)
Write-Host "`n4. Testing tags_by_categories" -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/api/kalshi-public/search/tags_by_categories" -UseBasicParsing
    $j = $r.Content | ConvertFrom-Json
    Write-Host "   Status: $($r.StatusCode)" -ForegroundColor Green
    if ($j.tags_by_categories.Politics) {
        Write-Host "   Politics tags: $($j.tags_by_categories.Politics.Count)"
    }
    if ($j.tags_by_categories.Crypto) {
        Write-Host "   Crypto tags: $($j.tags_by_categories.Crypto.Count)"
    }
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Markets by series_ticker (politics)
Write-Host "`n5. Testing markets by series_ticker (politics)" -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/api/kalshi-public/series?tags=US Elections" -UseBasicParsing
    $j = $r.Content | ConvertFrom-Json
    if ($j.series.Count -gt 0) {
        $ticker = $j.series[0].ticker
        Write-Host "   Using series: $ticker"
        $url = "http://localhost:3000/api/kalshi-public/markets?status=open&series_ticker=$ticker&limit=5"
        $r2 = Invoke-WebRequest -Uri $url -UseBasicParsing
        $j2 = $r2.Content | ConvertFrom-Json
        Write-Host "   Status: $($r2.StatusCode)" -ForegroundColor Green
        Write-Host "   Open markets for this series: $($j2.markets.Count)"
    }
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: Markets by series_ticker (crypto)
Write-Host "`n6. Testing markets by series_ticker (crypto)" -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/api/kalshi-public/series?tags=BTC" -UseBasicParsing
    $j = $r.Content | ConvertFrom-Json
    if ($j.series.Count -gt 0) {
        $ticker = $j.series[0].ticker
        Write-Host "   Using series: $ticker"
        $url = "http://localhost:3000/api/kalshi-public/markets?status=open&series_ticker=$ticker&limit=5"
        $r2 = Invoke-WebRequest -Uri $url -UseBasicParsing
        $j2 = $r2.Content | ConvertFrom-Json
        Write-Host "   Status: $($r2.StatusCode)" -ForegroundColor Green
        Write-Host "   Open markets for this series: $($j2.markets.Count)"
    }
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 7: Series with politics tags (checking for null response)
Write-Host "`n7. Testing /series?tags=US Elections (single tag)" -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/api/kalshi-public/series?tags=US Elections" -UseBasicParsing
    $j = $r.Content | ConvertFrom-Json
    Write-Host "   Status: $($r.StatusCode)" -ForegroundColor Green
    if ($j.series -eq $null) {
        Write-Host "   Series: NULL (no series found)" -ForegroundColor Red
    } else {
        Write-Host "   Series count: $($j.series.Count)"
        if ($j.series.Count -gt 0) {
            Write-Host "   Sample ticker: $($j.series[0].ticker)"
        }
    }
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 8: Direct markets check for politics
Write-Host "`n8. Testing /markets?status=open&limit=200 (checking for politics markets)" -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "http://localhost:3000/api/kalshi-public/markets?status=open&limit=200" -UseBasicParsing
    $j = $r.Content | ConvertFrom-Json
    Write-Host "   Status: $($r.StatusCode)" -ForegroundColor Green
    Write-Host "   Total markets: $($j.markets.Count)"
    $politicsCount = 0
    $cryptoCount = 0
    foreach ($m in $j.markets) {
        $title = ($m.title -join " ").ToLower()
        if ($title -match "election|president|trump|biden|senate|house|congress|vote|scotus") { $politicsCount++ }
        if ($title -match "bitcoin|btc|ethereum|eth|crypto|solana|sol") { $cryptoCount++ }
    }
    Write-Host "   Markets with politics keywords: $politicsCount"
    Write-Host "   Markets with crypto keywords: $cryptoCount"
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan

