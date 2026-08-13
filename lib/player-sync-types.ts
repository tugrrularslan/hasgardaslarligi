export type LeaguePlayerRecord = {
  name: string;
  team: string;
};

export type PlayerTransfer = {
  name: string;
  fromTeam: string;
  toTeam: string;
};

export type FailedTeamSync = {
  team: string;
  reason: string;
  usedPreviousData: boolean;
};

export type PlayerSyncHealth = {
  ok: boolean;
  issues: string[];
  expectedTeamCount: number;
  providerTeamCount: number;
  rosterTeamCount: number;
  emptyTeams: string[];
  lowPlayerCountTeams: Array<{ team: string; count: number }>;
  invalidTeams: string[];
  missingCrests: string[];
  duplicatePlayers: string[];
};

export type PlayerSyncReport = {
  source: "admin" | "cron" | "bootstrap";
  startedAt: string;
  completedAt: string;
  persisted: boolean;
  previousPlayerCount: number;
  playerCount: number;
  successfulTeamCount: number;
  addedPlayers: LeaguePlayerRecord[];
  removedPlayers: LeaguePlayerRecord[];
  transferredPlayers: PlayerTransfer[];
  failedTeams: FailedTeamSync[];
  health: PlayerSyncHealth;
};

export type PlayerRosterResponse = {
  success: boolean;
  players: LeaguePlayerRecord[];
  teamCount: number;
  syncedAt: string | null;
  report?: PlayerSyncReport;
  error?: string;
};
