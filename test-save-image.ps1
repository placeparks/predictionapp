# PowerShell script to test image generation and save the result

$body = @{
    stats = @{
        tx_count = 183
        unique_peers = 10
        erc20_count = 5
        nft_count = 3
        nft_collections = 2
        erc20_usd = 0
        has_basename = $false
    }
} | ConvertTo-Json -Depth 10

Write-Host "Testing image generation..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/test-image-generation" -Method POST -ContentType "application/json" -Body $body
    
    if ($response.ok) {
        Write-Host "✅ Image generated successfully!" -ForegroundColor Green
        Write-Host "   Tier: $($response.tier)" -ForegroundColor Yellow
        Write-Host "   Animal: $($response.animal)" -ForegroundColor Yellow
        Write-Host "   Image size: $($response.imageSize) bytes" -ForegroundColor Yellow
        
        # Save the base64 image
        if ($response.image) {
            # Extract base64 data
            $base64Data = $response.image -replace '^data:image/png;base64,', ''
            $bytes = [Convert]::FromBase64String($base64Data)
            
            # Save to file
            $outputPath = "test-nft-image-tier-$($response.tier)-$($response.animal).png"
            [System.IO.File]::WriteAllBytes($outputPath, $bytes)
            
            Write-Host "💾 Image saved to: $outputPath" -ForegroundColor Green
            
            # Try to open the image
            if (Test-Path $outputPath) {
                Write-Host "🖼️  Opening image..." -ForegroundColor Cyan
                Start-Process $outputPath
            }
        }
    } else {
        Write-Host "❌ Error: $($response.error)" -ForegroundColor Red
        Write-Host "   Message: $($response.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Request failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}
