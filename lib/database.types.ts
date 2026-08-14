import type { GameType } from './gameTypes';

export type Role = 'admin' | 'member';

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
  must_change_password: boolean;
  participant_number: number;
  avatar_url: string | null;
  created_at: string;
};

export type Team = {
  id: string;
  name: string;
  commander_id: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type ProjectTeamBalance = {
  project_id: string;
  team_id: string;
  balance: number;
};

export type ProjectProfileBalance = {
  project_id: string;
  profile_id: string;
  balance: number;
};

export type TeamMember = {
  id: string;
  team_id: string;
  profile_id: string;
  created_at: string;
};

export type Transaction = {
  id: string;
  project_id: string | null;
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
  economy_enabled: boolean;
  default_game_type: GameType | null;
  created_by: string | null;
  created_at: string;
};

export type ProjectOrganizer = {
  id: string;
  project_id: string;
  profile_id: string;
  created_at: string;
};

export type GameOrganizer = {
  id: string;
  game_id: string;
  profile_id: string;
  created_at: string;
};

export type PolygonType = 'built_up' | 'forest' | 'field' | 'sqb' | 'mixed';

export type Polygon = {
  id: string;
  name: string;
  country: string | null;
  region: string | null;
  city: string | null;
  address: string | null;
  type: PolygonType;
  created_by: string | null;
  created_at: string;
};

export type PolygonMap = {
  id: string;
  polygon_id: string;
  storage_path: string;
  file_name: string;
  content_type: string | null;
  created_by: string | null;
  created_at: string;
};

export type Game = {
  id: string;
  project_id: string;
  name: string;
  polygon_id: string;
  starts_at: string | null;
  ends_at: string | null;
  description: string | null;
  game_type: GameType | null;
  created_by: string | null;
  created_at: string;
};

export type GameStage = {
  id: string;
  game_id: string;
  position: number;
  title: string;
  description: string | null;
  created_at: string;
};

export type GameAttachment = {
  id: string;
  game_id: string;
  storage_path: string;
  file_name: string;
  content_type: string | null;
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

export type GameParticipantStatus = 'pending' | 'confirmed';

export type GameParticipant = {
  id: string;
  game_id: string;
  team_id: string | null;
  profile_id: string;
  status: GameParticipantStatus;
  side_id: string | null;
  created_at: string;
};

export type PersonalTransactionKind =
  | 'deposit'
  | 'team_to_participant'
  | 'participant_to_team'
  | 'participant_to_participant'
  | 'task_reward'
  | 'trader_charge';

export type PersonalTransaction = {
  id: string;
  project_id: string | null;
  kind: PersonalTransactionKind;
  from_profile_id: string | null;
  from_team_id: string | null;
  to_profile_id: string | null;
  to_team_id: string | null;
  amount: number;
  note: string | null;
  task_id: string | null;
  created_at: string;
};

export type GameTrader = {
  id: string;
  game_id: string;
  profile_id: string;
  created_at: string;
};

export type GameTraderSide = {
  game_trader_id: string;
  side_id: string;
};

export type TaskVisibility = 'side' | 'team' | 'personal' | 'claimable';
export type TaskStatus = 'open' | 'claimed' | 'completed' | 'cancelled';

export type Task = {
  id: string;
  game_id: string;
  title: string;
  description: string | null;
  visibility: TaskVisibility;
  side_id: string;
  team_id: string | null;
  assignee_profile_id: string | null;
  customer_profile_id: string;
  reward: number | null;
  status: TaskStatus;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  completed_by: string | null;
};

export type TaskAttachmentKind = 'file' | 'image' | 'audio';

export type TaskAttachment = {
  id: string;
  task_id: string;
  kind: TaskAttachmentKind;
  storage_path: string;
  file_name: string;
  content_type: string | null;
  created_by: string | null;
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
      project_organizers: {
        Row: ProjectOrganizer;
        Insert: Partial<ProjectOrganizer> & { project_id: string; profile_id: string };
        Update: Partial<ProjectOrganizer>;
        Relationships: [
          {
            foreignKeyName: 'project_organizers_project_id_fkey';
            columns: ['project_id'];
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_organizers_profile_id_fkey';
            columns: ['profile_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      game_organizers: {
        Row: GameOrganizer;
        Insert: Partial<GameOrganizer> & { game_id: string; profile_id: string };
        Update: Partial<GameOrganizer>;
        Relationships: [
          {
            foreignKeyName: 'game_organizers_game_id_fkey';
            columns: ['game_id'];
            referencedRelation: 'games';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'game_organizers_profile_id_fkey';
            columns: ['profile_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      games: {
        Row: Game;
        Insert: Partial<Game> & { project_id: string; name: string; polygon_id: string };
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
          {
            foreignKeyName: 'games_polygon_id_fkey';
            columns: ['polygon_id'];
            referencedRelation: 'polygons';
            referencedColumns: ['id'];
          },
        ];
      };
      polygons: {
        Row: Polygon;
        Insert: Partial<Polygon> & { name: string; type: PolygonType };
        Update: Partial<Polygon>;
        Relationships: [
          {
            foreignKeyName: 'polygons_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      polygon_maps: {
        Row: PolygonMap;
        Insert: Partial<PolygonMap> & { polygon_id: string; storage_path: string; file_name: string };
        Update: Partial<PolygonMap>;
        Relationships: [
          {
            foreignKeyName: 'polygon_maps_polygon_id_fkey';
            columns: ['polygon_id'];
            referencedRelation: 'polygons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'polygon_maps_created_by_fkey';
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
        Insert: Partial<GameParticipant> & { game_id: string; profile_id: string };
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
          {
            foreignKeyName: 'game_participants_side_id_fkey';
            columns: ['side_id'];
            referencedRelation: 'game_sides';
            referencedColumns: ['id'];
          },
        ];
      };
      game_stages: {
        Row: GameStage;
        Insert: Partial<GameStage> & { game_id: string; title: string };
        Update: Partial<GameStage>;
        Relationships: [
          {
            foreignKeyName: 'game_stages_game_id_fkey';
            columns: ['game_id'];
            referencedRelation: 'games';
            referencedColumns: ['id'];
          },
        ];
      };
      game_attachments: {
        Row: GameAttachment;
        Insert: Partial<GameAttachment> & { game_id: string; storage_path: string; file_name: string };
        Update: Partial<GameAttachment>;
        Relationships: [
          {
            foreignKeyName: 'game_attachments_game_id_fkey';
            columns: ['game_id'];
            referencedRelation: 'games';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'game_attachments_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      personal_transactions: {
        Row: PersonalTransaction;
        Insert: Partial<PersonalTransaction> & { kind: PersonalTransactionKind; amount: number };
        Update: Partial<PersonalTransaction>;
        Relationships: [
          {
            foreignKeyName: 'personal_transactions_from_profile_id_fkey';
            columns: ['from_profile_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_transactions_to_profile_id_fkey';
            columns: ['to_profile_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_transactions_from_team_id_fkey';
            columns: ['from_team_id'];
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_transactions_to_team_id_fkey';
            columns: ['to_team_id'];
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      project_team_balances: {
        Row: ProjectTeamBalance;
        Insert: Partial<ProjectTeamBalance> & { project_id: string; team_id: string };
        Update: Partial<ProjectTeamBalance>;
        Relationships: [
          {
            foreignKeyName: 'project_team_balances_project_id_fkey';
            columns: ['project_id'];
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_team_balances_team_id_fkey';
            columns: ['team_id'];
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      project_profile_balances: {
        Row: ProjectProfileBalance;
        Insert: Partial<ProjectProfileBalance> & { project_id: string; profile_id: string };
        Update: Partial<ProjectProfileBalance>;
        Relationships: [
          {
            foreignKeyName: 'project_profile_balances_project_id_fkey';
            columns: ['project_id'];
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_profile_balances_profile_id_fkey';
            columns: ['profile_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      game_traders: {
        Row: GameTrader;
        Insert: Partial<GameTrader> & { game_id: string; profile_id: string };
        Update: Partial<GameTrader>;
        Relationships: [
          {
            foreignKeyName: 'game_traders_game_id_fkey';
            columns: ['game_id'];
            referencedRelation: 'games';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'game_traders_profile_id_fkey';
            columns: ['profile_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      game_trader_sides: {
        Row: GameTraderSide;
        Insert: Partial<GameTraderSide> & { game_trader_id: string; side_id: string };
        Update: Partial<GameTraderSide>;
        Relationships: [
          {
            foreignKeyName: 'game_trader_sides_game_trader_id_fkey';
            columns: ['game_trader_id'];
            referencedRelation: 'game_traders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'game_trader_sides_side_id_fkey';
            columns: ['side_id'];
            referencedRelation: 'game_sides';
            referencedColumns: ['id'];
          },
        ];
      };
      tasks: {
        Row: Task;
        Insert: Partial<Task> & {
          game_id: string;
          title: string;
          visibility: TaskVisibility;
          side_id: string;
          customer_profile_id: string;
          created_by: string;
        };
        Update: Partial<Task>;
        Relationships: [
          {
            foreignKeyName: 'tasks_game_id_fkey';
            columns: ['game_id'];
            referencedRelation: 'games';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_side_id_fkey';
            columns: ['side_id'];
            referencedRelation: 'game_sides';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_team_id_fkey';
            columns: ['team_id'];
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_assignee_profile_id_fkey';
            columns: ['assignee_profile_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_customer_profile_id_fkey';
            columns: ['customer_profile_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      task_attachments: {
        Row: TaskAttachment;
        Insert: Partial<TaskAttachment> & { task_id: string; kind: TaskAttachmentKind; storage_path: string; file_name: string };
        Update: Partial<TaskAttachment>;
        Relationships: [
          {
            foreignKeyName: 'task_attachments_task_id_fkey';
            columns: ['task_id'];
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_attachments_created_by_fkey';
            columns: ['created_by'];
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
          p_project_id: string;
          p_from_team_id: string;
          p_to_team_id: string;
          p_amount: number;
          p_note?: string | null;
        };
        Returns: Transaction;
      };
      deposit_to_participant: {
        Args: {
          p_project_id: string;
          p_to_profile_id: string;
          p_amount: number;
          p_note?: string | null;
        };
        Returns: PersonalTransaction;
      };
      deposit_to_team: {
        Args: {
          p_project_id: string;
          p_to_team_id: string;
          p_amount: number;
          p_note?: string | null;
        };
        Returns: Transaction;
      };
      distribute_to_participant: {
        Args: {
          p_project_id: string;
          p_from_team_id: string;
          p_to_profile_id: string;
          p_amount: number;
          p_note?: string | null;
        };
        Returns: PersonalTransaction;
      };
      transfer_to_team: {
        Args: {
          p_project_id: string;
          p_to_team_id: string;
          p_amount: number;
          p_note?: string | null;
        };
        Returns: PersonalTransaction;
      };
      transfer_to_participant: {
        Args: {
          p_project_id: string;
          p_to_profile_id: string;
          p_amount: number;
          p_note?: string | null;
        };
        Returns: PersonalTransaction;
      };
      claim_task: {
        Args: {
          p_task_id: string;
        };
        Returns: Task;
      };
      assign_task: {
        Args: {
          p_task_id: string;
          p_profile_id: string;
        };
        Returns: Task;
      };
      cancel_task: {
        Args: {
          p_task_id: string;
        };
        Returns: Task;
      };
      complete_task: {
        Args: {
          p_task_id: string;
          p_recipient_profile_id?: string | null;
        };
        Returns: Task;
      };
      set_team_avatar: {
        Args: {
          p_team_id: string;
          p_avatar_url: string | null;
        };
        Returns: Team;
      };
      trader_charge_participant: {
        Args: {
          p_project_id: string;
          p_game_id: string;
          p_from_profile_id: string;
          p_amount: number;
          p_note?: string | null;
        };
        Returns: PersonalTransaction;
      };
      trader_charge_team: {
        Args: {
          p_project_id: string;
          p_game_id: string;
          p_from_team_id: string;
          p_amount: number;
          p_note?: string | null;
        };
        Returns: PersonalTransaction;
      };
    };
  };
};
