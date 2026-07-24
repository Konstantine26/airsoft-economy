export type Role = 'admin' | 'organizer' | 'member';

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
  must_change_password: boolean;
  created_at: string;
};

export type Team = {
  id: string;
  name: string;
  balance: number;
  commander_id: string | null;
  created_at: string;
};

export type TeamMember = {
  id: string;
  team_id: string;
  profile_id: string;
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

export type Project = {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
};

export type Game = {
  id: string;
  project_id: string;
  name: string;
  polygon: string;
  starts_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type GameSide = {
  id: string;
  game_id: string;
  name: string;
  commander_id: string | null;
};

export type GameTeamSide = {
  id: string;
  game_id: string;
  team_id: string;
  side_id: string;
  created_at: string;
};

export type GameParticipant = {
  id: string;
  game_id: string;
  team_id: string;
  profile_id: string;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      teams: {
        Row: Team;
        Insert: Partial<Team> & { name: string };
        Update: Partial<Team>;
        Relationships: [
          {
            foreignKeyName: 'teams_commander_id_fkey';
            columns: ['commander_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      team_members: {
        Row: TeamMember;
        Insert: Partial<TeamMember> & { team_id: string; profile_id: string };
        Update: Partial<TeamMember>;
        Relationships: [
          {
            foreignKeyName: 'team_members_team_id_fkey';
            columns: ['team_id'];
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_members_profile_id_fkey';
            columns: ['profile_id'];
            referencedRelation: 'profiles';
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
      projects: {
        Row: Project;
        Insert: Partial<Project> & { name: string };
        Update: Partial<Project>;
        Relationships: [
          {
            foreignKeyName: 'projects_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      games: {
        Row: Game;
        Insert: Partial<Game> & { project_id: string; name: string; polygon: string };
        Update: Partial<Game>;
        Relationships: [
          {
            foreignKeyName: 'games_project_id_fkey';
            columns: ['project_id'];
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'games_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      game_sides: {
        Row: GameSide;
        Insert: Partial<GameSide> & { game_id: string; name: string };
        Update: Partial<GameSide>;
        Relationships: [
          {
            foreignKeyName: 'game_sides_game_id_fkey';
            columns: ['game_id'];
            referencedRelation: 'games';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'game_sides_commander_id_fkey';
            columns: ['commander_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      game_team_sides: {
        Row: GameTeamSide;
        Insert: Partial<GameTeamSide> & { game_id: string; team_id: string; side_id: string };
        Update: Partial<GameTeamSide>;
        Relationships: [
          {
            foreignKeyName: 'game_team_sides_game_id_fkey';
            columns: ['game_id'];
            referencedRelation: 'games';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'game_team_sides_team_id_fkey';
            columns: ['team_id'];
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'game_team_sides_side_id_fkey';
            columns: ['side_id'];
            referencedRelation: 'game_sides';
            referencedColumns: ['id'];
          },
        ];
      };
      game_participants: {
        Row: GameParticipant;
        Insert: Partial<GameParticipant> & { game_id: string; team_id: string; profile_id: string };
        Update: Partial<GameParticipant>;
        Relationships: [
          {
            foreignKeyName: 'game_participants_game_id_fkey';
            columns: ['game_id'];
            referencedRelation: 'games';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'game_participants_team_id_fkey';
            columns: ['team_id'];
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'game_participants_profile_id_fkey';
            columns: ['profile_id'];
            referencedRelation: 'profiles';
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
