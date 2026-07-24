export type Team = {
  id: string;
  name: string;
  balance: number;
  created_at: string;
};

export type User = {
  id: string;
  name: string;
  team_id: string | null;
  created_at: string;
};

export type Transaction = {
  id: string;
  from_team_id: string | null;
  to_team_id: string | null;
  amount: number;
  note: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      teams: {
        Row: Team;
        Insert: Partial<Team> & { name: string };
        Update: Partial<Team>;
        Relationships: [];
      };
      users: {
        Row: User;
        Insert: Partial<User> & { name: string };
        Update: Partial<User>;
        Relationships: [
          {
            foreignKeyName: 'users_team_id_fkey';
            columns: ['team_id'];
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      transactions: {
        Row: Transaction;
        Insert: Partial<Transaction> & { amount: number };
        Update: Partial<Transaction>;
        Relationships: [
          {
            foreignKeyName: 'transactions_from_team_id_fkey';
            columns: ['from_team_id'];
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transactions_to_team_id_fkey';
            columns: ['to_team_id'];
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      transfer_funds: {
        Args: {
          p_from_team_id: string;
          p_to_team_id: string;
          p_amount: number;
          p_note?: string | null;
        };
        Returns: Transaction;
      };
    };
  };
};
