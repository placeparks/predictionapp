# Kalshi API Integration Setup

This project integrates with the Kalshi prediction markets API to display live markets and enable predictions.

## Environment Variables Required

Add these to your `.env.local` file:

```env
# Kalshi API Credentials (Required)
KALSHI_EMAIL=your_kalshi_email@example.com
KALSHI_PASSWORD=your_kalshi_password

# Optional: Use demo API for testing
# KALSHI_API_URL=https://demo-api.kalshi.co/trade-api/v2

# Optional: API Key (if using key-based auth instead of email/password)
# KALSHI_API_KEY=your_api_key_here
```

## Getting Kalshi Credentials

1. Go to [kalshi.com](https://kalshi.com) and create an account
2. For testing, you can use the [demo environment](https://demo-api.kalshi.co)
3. Your email and password are used to authenticate with the API
4. The system automatically manages authentication tokens (30-minute cache)

## Testing Your Setup

### Test 1: Check Environment Variables
```bash
npm run test:kalshi
```
This will verify that `KALSHI_API_KEY` is set (if using key-based auth).

### Test 2: Test Full API Connection
```bash
npm run test:kalshi-api
```
This comprehensive test will:
- ✅ Check all environment variables
- ✅ Authenticate with Kalshi API
- ✅ Fetch sample markets
- ✅ Display market data

## API Endpoints

The following API routes are available:

### 1. Authentication
- **POST** `/api/kalshi/auth` - Login and get token
- **GET** `/api/kalshi/auth` - Check cached token

### 2. Markets
- **GET** `/api/kalshi/markets` - List all markets
  - Query params: `limit`, `status`, `category`, `cursor`

### 3. Market Details
- **GET** `/api/kalshi/market/[ticker]` - Get specific market

### 4. Orderbook
- **GET** `/api/kalshi/orderbook/[ticker]` - Get market orderbook
  - Query params: `depth`

### 5. Create Order
- **POST** `/api/kalshi/create-order` - Place an order
  - Body: `{ ticker, action, side, yesPrice, noPrice, count }`

## Frontend Integration

The Kalshi predictions are integrated into the main page under the "Predictions" tab:

```tsx
import KalshiPredictions from './components/KalshiPredictions';

<KalshiPredictions address={userAddress} />
```

## Features

- 🎯 **Live Markets**: Real-time prediction markets from Kalshi
- 📊 **Category Filtering**: Filter by crypto, economics, politics, sports, etc.
- 💰 **Price Display**: See current YES/NO prices in cents
- ⏰ **Time Remaining**: Countdown to market expiration
- 📈 **Volume Stats**: Track market trading volume
- 🎨 **Beautiful UI**: Modern gradient design with smooth animations

## Authentication Flow

1. API routes automatically call `getKalshiToken()` helper
2. Token is cached in memory for 29 minutes
3. If token expired, automatically re-authenticates using env credentials
4. All requests include `Authorization: Bearer {token}` header

## Troubleshooting

### "Failed to authenticate with Kalshi"
- Check your `KALSHI_EMAIL` and `KALSHI_PASSWORD` are correct
- Try the demo API first: set `KALSHI_API_URL=https://demo-api.kalshi.co/trade-api/v2`
- Run `npm run test:kalshi-api` to debug

### "No markets available"
- Markets might be filtered by category
- Check if markets are actually open on Kalshi
- Try selecting "All Markets" category

### Network Errors
- Ensure you have internet connection
- Check if Kalshi API is operational
- Verify firewall/proxy settings

## Demo vs Production

**Demo API:**
```env
KALSHI_API_URL=https://demo-api.kalshi.co/trade-api/v2
```
- Use test credentials
- No real money
- Perfect for development

**Production API (default):**
```env
KALSHI_API_URL=https://trading-api.kalshi.com/trade-api/v2
```
- Real markets and money
- Requires verified Kalshi account
- Use with caution

## Next Steps

1. ✅ Environment variables configured
2. ✅ API endpoints working
3. ✅ Frontend integrated
4. 🚧 Implement order placement
5. 🚧 Add user portfolio tracking
6. 🚧 Connect predictions to XP/NFT system

## Resources

- [Kalshi API Documentation](https://kalshi.com/api)
- [Kalshi Trading API](https://trading-api.kalshi.com/docs)
- [Demo Environment](https://demo-api.kalshi.co/docs)




