export interface Table {
  id: number;
  owner_id: number; // User who created the table
  name: string;
  status: 'open' | 'full' | 'completed' | 'archived';
  max_members: number;
  entry_fee: number;
  reward_pool: number;
  exp_pool: number;
  created_at: Date;
  completed_at?: Date | null;
  // New fields for QOINZ Table Challenge system
  level?: number; // Table level in the challenge system
  parent_table_id?: number | null; // Parent table for split logic
  platform_fee?: number; // Platform fee for this table
  reward_amount?: number; // Reward for reaching the end of this table
  updated_at?: Date;
} 