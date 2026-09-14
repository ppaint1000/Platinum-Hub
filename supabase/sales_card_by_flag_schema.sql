-- The Sales page's "who gets a card" query now reads user_app_access.sales
-- directly (so an admin can opt themselves in without changing role - see
-- src/app/sales/page.tsx), not just profiles.role = 'sales'. A
-- sales_authority user (not admin) needs to read *everyone's* sales flag
-- for that "see all" view to work, same as the existing
-- profiles_sales_authority_select policy grants for profiles.

drop policy if exists "user_app_access_sales_authority_select" on public.user_app_access;
create policy "user_app_access_sales_authority_select" on public.user_app_access
  for select using (
    public.current_profile_role() = 'sales'
    and public.current_user_is_sales_authority()
  );
