# 🔑 Kalshi API Key Setup Guide

## ✅ You're Right - API Keys Work!

Kalshi supports **API Key + Private Key** authentication, which is perfect for programmatic access without needing user credentials.

---

## 📝 Step 1: Get Your API Credentials from Kalshi

### For Production (Real Markets):

1. **Go to Kalshi.com**
   - Visit [kalshi.com](https://kalshi.com)
   - Log in to your account

2. **Navigate to API Settings**
   - Go to **Account Settings**
   - Click on **API Keys** section
   - Click **"Create New API Key"**

3. **Save Your Credentials**
   You'll receive:
   - `API Key ID` (e.g., `abc123def456...`)
   - `Private Key` (RSA key in PEM format)

   ⚠️ **IMPORTANT:** The private key is only shown ONCE! Save it immediately.

### For Demo/Testing:

Demo API may have different credentials - check Kalshi's documentation for demo API key access.

---

## 🔧 Step 2: Configure Your `.env.local` File

Your private key will look something like this:

```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
[many lines of base64 encoded data]
...XYZ123
-----END PRIVATE KEY-----
```

### Add to `.env.local`:

```env
# Kalshi API Key Authentication
KALSHI_API_KEY_ID=your_api_key_id_here
KALSHI_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
[paste your full private key here with actual newlines]
...XYZ123
-----END PRIVATE KEY-----"

# Optional: Specify API URL (defaults to production)
# KALSHI_API_URL=https://api.elections.kalshi.com/trade-api/v2
```

### 💡 Important Notes:

1. **Keep the quotes** around the private key
2. **Include the BEGIN/END markers**
3. **Preserve actual newlines** (or use `\n` for line breaks)
4. **Never commit** this file to git (it should be in `.gitignore`)

---

## Alternative: One-Line Format

If you prefer, you can format the private key on one line with `\n` for newlines:

```env
KALSHI_API_KEY_ID=your_api_key_id_here
KALSHI_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----"
```

---

## 🧪 Step 3: Test Your Configuration

Run the test script:

```bash
npm run test:kalshi-api
```

**Expected Output:**

```
🔍 Testing Kalshi API Configuration...

Environment Variables Check:
----------------------------
KALSHI_API_KEY_ID: ✅ Set
KALSHI_PRIVATE_KEY: ✅ Set (1704 chars)
KALSHI_API_URL: Using default production URL

🔐 Testing Authentication (API Key)...
----------------------------

Attempting login to: https://api.elections.kalshi.com/trade-api/v2
Using API Key authentication...

✅ Authentication successful!
   Auth Method: API Key
   Token: eyJhbGciOiJIUzI1NiI...
   Member ID: your-member-id

📊 Testing Markets API...
----------------------------
✅ Successfully fetched 5 markets

📈 Sample Markets:

   1. Will Bitcoin hit $100K by year end?
      Ticker: BTCUSD-100K-DEC31
      Category: crypto
      Yes Price: 67¢
      Volume: $125000

✅ All tests passed! Your Kalshi API is configured correctly.

🚀 Next step: Run "npm run dev" and click the Predictions tab!
```

---

## 🎯 Step 4: Run Your App

```bash
npm run dev
```

Then:
1. Open http://localhost:3000
2. Connect your wallet
3. Click **"Predictions"** tab
4. See live Kalshi markets! 🎉

---

## 🔍 How It Works

### Authentication Flow:

1. **Generate Signature**
   ```
   message = timestamp + method + path + body
   signature = RSA-SHA256(message, private_key)
   ```

2. **Send Headers**
   ```
   KALSHI-ACCESS-KEY: your_api_key_id
   KALSHI-ACCESS-SIGNATURE: generated_signature
   KALSHI-ACCESS-TIMESTAMP: current_timestamp
   ```

3. **Get Token**
   - Kalshi validates signature
   - Returns JWT token (valid 30 min)
   - Token is cached for subsequent requests

4. **Use Token**
   ```
   Authorization: Bearer {token}
   ```

### Code Implementation:

Your API routes automatically handle this! The system:
- ✅ Tries API key auth first (if configured)
- ✅ Falls back to email/password (if API key fails)
- ✅ Caches tokens (29 min lifetime)
- ✅ Auto-refreshes expired tokens

---

## 🐛 Troubleshooting

### Error: "Authentication failed"

**Check:**
1. API Key ID is correct (no typos)
2. Private key includes `-----BEGIN/END PRIVATE KEY-----` markers
3. Private key format is correct (PEM format)
4. No extra spaces or characters in the key
5. System clock is synchronized (important for timestamp validation)

### Error: "Invalid signature"

**Common causes:**
- Newline characters not preserved correctly
- Private key corrupted during copy/paste
- System time is wrong
- Using wrong API endpoint URL

### Test with OpenSSL:

Verify your private key format:
```bash
openssl rsa -in your_key.pem -check -noout
```

Should output: `RSA key ok`

---

## 📊 API Capabilities

With API key authentication, you can:

✅ **Read Market Data** (No trading permissions needed)
- List all active markets
- Get market details
- View orderbooks
- Check market history

✅ **Trading** (If enabled on your API key)
- Place orders
- Cancel orders
- View portfolio
- Check balances

✅ **User Data**
- Get account info
- View trade history
- Check positions

---

## 🔒 Security Best Practices

1. **Never expose your private key**
   - Don't commit to git
   - Don't share in screenshots
   - Don't log in console

2. **Use environment variables**
   - Store in `.env.local` (gitignored)
   - Use secure secret management in production
   - Rotate keys periodically

3. **Limit API key permissions**
   - Only enable needed permissions
   - Use read-only keys for displaying data
   - Separate keys for trading vs. viewing

4. **Monitor usage**
   - Check API logs regularly
   - Set up alerts for unusual activity
   - Revoke compromised keys immediately

---

## 🚀 Production Deployment

When deploying to production (Vercel, etc.):

1. **Add environment variables** in your hosting platform:
   ```
   KALSHI_API_KEY_ID=...
   KALSHI_PRIVATE_KEY=...
   ```

2. **Use secrets management**:
   - Vercel: Project Settings → Environment Variables
   - AWS: Secrets Manager
   - Railway: Environment Variables

3. **Enable Redis caching**:
   - Replace in-memory token cache
   - Share tokens across serverless functions

---

## 📚 Resources

- [Kalshi API Documentation](https://docs.kalshi.com)
- [API Keys Guide](https://docs.kalshi.com/getting_started/api_keys)
- [Trading API Reference](https://api.elections.kalshi.com/docs)
- [Kalshi SDKs](https://docs.kalshi.com/sdks/overview)

---

## ✨ What's Next?

Your integration is ready! The system will:
1. ✅ Authenticate using your API key
2. ✅ Fetch live markets
3. ✅ Display predictions in beautiful UI
4. ✅ Auto-refresh tokens
5. ✅ Handle errors gracefully

**Ready to test?** Run: `npm run test:kalshi-api`




