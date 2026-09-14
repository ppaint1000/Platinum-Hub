-- Split sales_targets.budget_amount into separate Quoted and Won budgets -
-- the business tracks a quoting target and a winning target separately,
-- not one shared number. Existing values carry over as the "won" budget
-- (that's what the single column meant before this split).

alter table public.sales_targets rename column budget_amount to budget_won;
alter table public.sales_targets add column if not exists budget_quoted numeric(12,2) not null default 0;
