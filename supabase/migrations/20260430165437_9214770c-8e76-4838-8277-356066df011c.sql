
REVOKE EXECUTE ON FUNCTION public.claim_signals_for_resolution(integer, integer, integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.claim_signals_for_horizon(integer, text, integer) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.claim_signals_for_resolution(integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_signals_for_horizon(integer, text, integer) TO service_role;
