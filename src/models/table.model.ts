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
} 