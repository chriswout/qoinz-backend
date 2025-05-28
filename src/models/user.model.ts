export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  level: number;
  exp: number;
  branch_slots: number;
  active_branches: number;
  first_name: string;
  last_name: string;
  phone: string;
  qoinz_balance: number;
  referral_code: string;
  total_referrals: number;
  total_qoinz_earned: number;
  last_level_up?: Date;
  created_at: Date;
  updated_at: Date;
  referrer_id?: number;
  voucher_code_used?: string;
  branch_completion_count: number;
  total_exp_earned: number;
  last_activity?: Date;
  status: 'active' | 'inactive' | 'suspended';
  role: 'user' | 'admin' | 'moderator';
} 