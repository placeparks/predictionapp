-- Quick fix for energy_balances and eligibility permissions
-- Run this in your Supabase SQL Editor

-- Grant permissions to anon and authenticated roles for energy_balances
GRANT SELECT, INSERT, UPDATE ON public.energy_balances TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_energy(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.spend_energy(TEXT, NUMERIC) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_energy(TEXT, NUMERIC) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_energy_info(TEXT) TO anon, authenticated, service_role;

-- Make functions security definer so they can access the table
ALTER FUNCTION public.get_current_energy(TEXT) SECURITY DEFINER;
ALTER FUNCTION public.spend_energy(TEXT, NUMERIC) SECURITY DEFINER;
ALTER FUNCTION public.grant_energy(TEXT, NUMERIC) SECURITY DEFINER;
ALTER FUNCTION public.get_energy_info(TEXT) SECURITY DEFINER;

-- Grant permissions for eligibility table (needed for stats API)
GRANT SELECT, INSERT, UPDATE ON public.eligibility TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.wallet_stats TO anon, authenticated, service_role;

-- Grant permissions for referral system tables
GRANT SELECT, INSERT, UPDATE ON public.referrals TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.genesis_users TO anon, authenticated, service_role;

-- Grant EXECUTE permissions on referral functions
GRANT EXECUTE ON FUNCTION public.create_referral(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_referral_rewards(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_referral_activity(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_genesis_referral_streak(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_bet_token_multiplier(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_genesis_user(TEXT) TO anon, authenticated, service_role;

-- Make referral functions security definer
ALTER FUNCTION public.create_referral(TEXT, TEXT) SECURITY DEFINER;
ALTER FUNCTION public.process_referral_rewards(TEXT) SECURITY DEFINER;
ALTER FUNCTION public.check_referral_activity(TEXT) SECURITY DEFINER;
ALTER FUNCTION public.update_genesis_referral_streak(TEXT) SECURITY DEFINER;
ALTER FUNCTION public.get_bet_token_multiplier(TEXT) SECURITY DEFINER;
ALTER FUNCTION public.set_genesis_user(TEXT) SECURITY DEFINER;

-- Grant permissions for Base Daily tables
GRANT SELECT, INSERT, UPDATE ON public.base_daily_entries TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.base_daily_outcomes TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.base_daily_sessions TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.base_daily_metrics_cache TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.base_daily_settlements TO anon, authenticated, service_role;

-- Grant EXECUTE permissions on Base Daily functions
GRANT EXECUTE ON FUNCTION public.award_base_daily_market(TEXT, TEXT) TO anon, authenticated, service_role;

-- Make Base Daily functions security definer (if not already)
ALTER FUNCTION public.award_base_daily_market(TEXT, TEXT) SECURITY DEFINER;

-- Grant permissions for referral code system tables (if referral codes SQL has been run)
GRANT SELECT, INSERT, UPDATE ON public.referral_codes TO anon, authenticated, service_role;

-- Grant EXECUTE permissions on referral code functions
GRANT EXECUTE ON FUNCTION public.generate_referral_code(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_and_use_referral_code(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_referral_codes(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_referral_code(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_referral_from_code(TEXT, TEXT) TO anon, authenticated, service_role;

-- Make referral code functions security definer
ALTER FUNCTION public.generate_referral_code(TEXT) SECURITY DEFINER;
ALTER FUNCTION public.validate_and_use_referral_code(TEXT, TEXT) SECURITY DEFINER;
ALTER FUNCTION public.get_user_referral_codes(TEXT) SECURITY DEFINER;
ALTER FUNCTION public.deactivate_referral_code(TEXT, TEXT) SECURITY DEFINER;
ALTER FUNCTION public.create_referral_from_code(TEXT, TEXT) SECURITY DEFINER;

-- Grant permissions for predictions system tables
GRANT SELECT, INSERT, UPDATE ON public.predictions TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.markets TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.periods TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.outcomes TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.distributions TO anon, authenticated, service_role;

