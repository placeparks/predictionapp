# Base Daily Auto-Resolve Deployment Checklist

## ✅ Pre-Deployment Checklist

### 1. Database Migration (CRITICAL - Must do first!)
- [ ] Run `supabase_base_daily_migration.sql` in Supabase SQL Editor
  - This updates `session_id` columns from `date` to `text`
  - Drops and recreates the `award_base_daily_market` function
  - Recreates the `v_base_daily_winners` view
  - **Without this, the cron job will fail!**

### 2. Environment Variables (Set in Vercel Dashboard)
Required variables:
- [ ] `ALCHEMY_API_KEY` - For fetching Base blockchain data
- [ ] `BASE_DAILY_ADMIN_KEY` - For authentication (or `ADMIN_API_KEY` / `API_ADMIN_KEY`)
- [ ] `SUPABASE_SERVICE_ROLE` - For database access
- [ ] `NEXT_PUBLIC_APP_URL` - Your production URL (e.g., `https://your-app.vercel.app`)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key
- [ ] `KALSHI_API_KEY_ID` - For Kalshi API authentication (for auto-resolution checker)
- [ ] `KALSHI_PRIVATE_KEY` - For Kalshi API authentication (or use `KALSHI_EMAIL` + `KALSHI_PASSWORD`)

Optional variables:
- [ ] `CRON_SECRET` - Optional, for additional cron authentication
- [ ] `NEXT_PUBLIC_BASE_DAILY_TEST` - Set to `"1"` for TEST_MODE, or leave unset for production
- [ ] `KALSHI_EMAIL` + `KALSHI_PASSWORD` - Alternative to API key authentication for Kalshi
- [ ] `KALSHI_API_URL` - Custom Kalshi API URL (defaults to production)

### 3. Vercel Configuration
- [ ] `vercel.json` is in the project root (✅ Already configured)
- [ ] Base Daily cron schedule: `*/25 * * * *` (every 25 minutes)
- [ ] Kalshi resolution checker cron schedule: `*/15 * * * *` (every 15 minutes)

### 4. Code Verification
- [ ] All files are committed and pushed
- [ ] No TypeScript errors
- [ ] Migration script is ready to run

## 🚀 Deployment Steps

1. **Run Database Migration First**
   ```sql
   -- Copy and paste entire supabase_base_daily_migration.sql into Supabase SQL Editor
   -- Click "Run" to execute
   ```

2. **Deploy to Vercel**
   ```bash
   vercel --prod
   ```
   Or push to your main branch if auto-deploy is enabled

3. **Set Environment Variables in Vercel**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add all required variables listed above

4. **Verify Cron Jobs**
   - After deployment, check Vercel Dashboard → Your Project → Cron Jobs
   - You should see two cron jobs listed:
     - `/api/base-daily/auto-resolve` (every 25 minutes)
     - `/api/settle/check` (every 15 minutes)
   - They will run automatically on schedule

## 🔍 Post-Deployment Verification

### Check Cron Job Status
1. Go to Vercel Dashboard → Your Project → Cron Jobs
2. Verify both cron jobs are listed and active:
   - `/api/base-daily/auto-resolve` (Base Daily markets)
   - `/api/settle/check` (Kalshi market resolutions)
3. Check execution logs after first run

### Test Manually (Optional)
You can manually trigger the cron jobs to test:

**Base Daily Auto-Resolve:**
```bash
curl -X POST https://your-app.vercel.app/api/base-daily/auto-resolve \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_KEY"
```

**Kalshi Resolution Checker:**
```bash
curl -X POST https://your-app.vercel.app/api/settle/check \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_KEY"
```

### Monitor Logs
- Check Vercel function logs for any errors
- Look for `[auto-resolve]` log messages (Base Daily)
- Look for `[settle/check]` log messages (Kalshi resolutions)
- Verify outcomes are being created in `base_daily_outcomes` table
- Verify predictions are being settled in `predictions` table

## ⚠️ Important Notes

1. **Cron jobs only work in Production** - They won't run in preview deployments
2. **First run timing**:
   - Base Daily auto-resolve: Runs 25 minutes after deployment
   - Kalshi resolution checker: Runs 15 minutes after deployment
3. **Database migration is critical** - Without it, the Base Daily cron job will fail with function errors
4. **Vercel cron detection** - The code automatically detects Vercel cron jobs, so no special headers needed
5. **Kalshi API credentials required** - The resolution checker needs Kalshi API credentials to check market status. Make sure `KALSHI_API_KEY_ID` + `KALSHI_PRIVATE_KEY` (or `KALSHI_EMAIL` + `KALSHI_PASSWORD`) are set

## 🐛 Troubleshooting

### Cron job not running
- Check Vercel Dashboard → Cron Jobs section
- Verify `vercel.json` is in the root directory
- Ensure you're on Production deployment (not preview)

### "unauthorized" errors
- Verify `BASE_DAILY_ADMIN_KEY` is set (or use Vercel cron detection)
- Check that the cron job is being detected (it should be automatic)

### "alchemy_not_configured" errors
- Verify `ALCHEMY_API_KEY` is set in Vercel environment variables
- Make sure it's set for Production environment

### Database errors
- Verify migration was run successfully
- Check `award_base_daily_market` function exists with `text` parameter
- Verify `v_base_daily_winners` view exists

### Kalshi resolution checker errors
- **"kalshi_auth_failed"**: Verify `KALSHI_API_KEY_ID` and `KALSHI_PRIVATE_KEY` are set (or `KALSHI_EMAIL` + `KALSHI_PASSWORD`)
- **"cannot_determine_outcome"**: Market is settled but outcome couldn't be determined - check Kalshi API response format
- **"not_found"**: Market ticker not found on Kalshi - verify `market_ticker` is stored correctly in predictions table
- Check Vercel function logs for `[settle/check]` messages to see detailed error information

