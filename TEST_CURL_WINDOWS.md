# Testing API from Windows Command Line

## Option 1: Use PowerShell (Recommended)

```powershell
# Simple test without reference image
Invoke-RestMethod -Uri "http://localhost:3000/api/test-image-generation" -Method POST -ContentType "application/json" -Body '{"stats":{"tx_count":183,"unique_peers":10,"erc20_count":5,"nft_count":3,"nft_collections":2,"erc20_usd":0,"has_basename":false}}'

# With reference image (save to variable first)
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
    referenceImage = "data:image/png;base64,iVBORw0KG..."
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://localhost:3000/api/test-image-generation" -Method POST -ContentType "application/json" -Body $body
```

## Option 2: Use curl with proper escaping for Windows

```cmd
curl -X POST http://localhost:3000/api/test-image-generation -H "Content-Type: application/json" -d "{\"stats\":{\"tx_count\":183,\"unique_peers\":10,\"erc20_count\":5,\"nft_count\":3,\"nft_collections\":2,\"erc20_usd\":0,\"has_basename\":false}}"
```

## Option 3: Use a JSON file

1. Create `test-request.json`:
```json
{
  "stats": {
    "tx_count": 183,
    "unique_peers": 10,
    "erc20_count": 5,
    "nft_count": 3,
    "nft_collections": 2,
    "erc20_usd": 0,
    "has_basename": false
  }
}
```

2. Then use:
```cmd
curl -X POST http://localhost:3000/api/test-image-generation -H "Content-Type: application/json" -d @test-request.json
```

## Option 4: Use Browser Developer Tools

1. Open browser DevTools (F12)
2. Go to Console tab
3. Run:
```javascript
fetch('http://localhost:3000/api/test-image-generation', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    stats: {
      tx_count: 183,
      unique_peers: 10,
      erc20_count: 5,
      nft_count: 3,
      nft_collections: 2,
      erc20_usd: 0,
      has_basename: false
    }
  })
})
.then(r => r.json())
.then(console.log)
```

## Option 5: Just use the GET endpoint in browser

Simply open:
```
http://localhost:3000/api/test-image-generation?tx_count=183&unique_peers=10&nft_count=3&tokens=5
```
