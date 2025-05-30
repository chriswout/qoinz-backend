export interface ExpLog {
  id: number;
  user_id: number;
  amount: number; // Positive or negative
  source: 'table_join' | 'table_complete' | 'achievement' | 'admin' | 'other';
  source_id?: number | null; // e.g., table_id, achievement_id
  created_at: Date;
} 