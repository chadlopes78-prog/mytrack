export type AccountStatus = "pending" | "approved" | "rejected" | "suspended";
export type SpendCurrency = "USD" | "USDT";

export interface Profile {
  id: string;
  email: string;
  status: AccountStatus;
  created_at: string;
}

export interface UserSettings {
  user_id: string;
  default_rate: number;
  reconciled_balance_usd: number | null;
  reconciled_on: string | null;
}

export interface Investment {
  id: string;
  user_id: string;
  usdt_amount: number;
  rate: number;
  mzn_amount: number;
  loaded_to_ads: boolean;
  occurred_at: string;
  note: string | null;
  created_at: string;
}

export interface DailyReport {
  id: string;
  user_id: string;
  report_date: string; // YYYY-MM-DD
  ad_spend: number;
  spend_currency: SpendCurrency;
  rate: number;
  ad_spend_mzn: number;
  revenue_mzn: number;
  other_expenses_mzn: number;
  net_profit_mzn: number;
  roas: number | null;
  note: string | null;
  created_at: string;
}

export interface VaultItem {
  id: string;
  label: string;
  login: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  email: string;
  status: AccountStatus;
  created_at: string;
  status_changed_at: string | null;
  is_admin: boolean;
  is_primary: boolean;
  email_confirmed: boolean;
  last_sign_in_at: string | null;
}
