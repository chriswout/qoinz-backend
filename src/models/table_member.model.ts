export interface TableMember {
  id: number;
  table_id: number;
  user_id: number;
  joined_at: Date;
  left_at?: Date | null;
  is_winner: boolean;
} 