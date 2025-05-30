export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  level: number;
  exp: number;
  table_slots: number; // Number of tables user can join/create
  first_name?: string;
  last_name?: string;
  phone?: string;
  qoinz_balance: number;
  created_at: Date;
  updated_at: Date;
} 