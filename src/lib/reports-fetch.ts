import { getHouseholdId } from "@/lib/household.server";

// Shared, plain (non-server-fn) helper used by both getReportsData and the
// server-side export job. Takes an authenticated Supabase client + user id.

export async function fetchReportsData(
  supabase: any,
  userId: string,
  from: string,
  to: string,
) {
  const householdId = await getHouseholdId({ supabase, userId });

  const [
    profileRes,
    accountsRes,
    categoriesRes,
    txnsRes,
    billsRes,
    billPaymentsRes,
    budgetsRes,
    budgetCatsRes,
    payeesRes,
    snapshotsRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("accounts").select("*").eq("household_id", householdId),
    supabase.from("categories").select("*").eq("household_id", householdId),
    supabase
      .from("transactions")
      .select(
        "*, category:categories(name, kind, parent_id), account:accounts!transactions_account_id_fkey(name, currency, category)",
      )
      .eq("household_id", householdId)
      .gte("txn_date", from)
      .lte("txn_date", to)
      .order("txn_date", { ascending: false })
      .limit(20000),
    supabase.from("bills").select("*").eq("household_id", householdId),
    supabase
      .from("bill_payments")
      .select("*")
      .eq("household_id", householdId)
      .gte("paid_on", from)
      .lte("paid_on", to),
    supabase.from("budgets").select("*").eq("household_id", householdId),
    supabase.from("budget_categories").select("*"),
    supabase.from("memorized_payees").select("*").eq("household_id", householdId),
    supabase
      .from("net_worth_snapshots")
      .select("*")
      .eq("household_id", householdId)
      .gte("snapshot_date", from)
      .lte("snapshot_date", to)
      .order("snapshot_date", { ascending: true }),
  ]);

  return {
    from,
    to,
    profile: profileRes.data ?? null,
    accounts: accountsRes.data ?? [],
    categories: categoriesRes.data ?? [],
    transactions: txnsRes.data ?? [],
    bills: billsRes.data ?? [],
    billPayments: billPaymentsRes.data ?? [],
    budgets: budgetsRes.data ?? [],
    budgetCategories: budgetCatsRes.data ?? [],
    payees: payeesRes.data ?? [],
    snapshots: snapshotsRes.data ?? [],
  };
}
