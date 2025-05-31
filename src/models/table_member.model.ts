export interface TableMember {
  id: number;
  table_id: number;
  user_id: number;
  // New fields for QOINZ Table Challenge system
  position?: number; // Player's slot in the table (1-8)
  current_level?: number; // Player's current level in the challenge
  joined_at: Date;
  left_at?: Date | null;
  is_winner: boolean;
} 