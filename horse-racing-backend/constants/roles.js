const ROLE_NAMES = {
  ADMIN: 'admin',
  HORSE_OWNER: 'horse_owner',
  JOCKEY: 'jockey',
  RACE_REFEREE: 'race_referee',
  SPECTATOR: 'spectator'
};

const ROLE_OPTIONS = [
  {
    value: ROLE_NAMES.ADMIN,
    label: 'Admin',
    description: 'Manage users, roles, tournaments, race schedules, approvals, referees, results, and predictions.'
  },
  {
    value: ROLE_NAMES.HORSE_OWNER,
    label: 'Horse Owner',
    description: 'Register horses, manage horse information, choose jockeys, confirm race participation, and track prizes.'
  },
  {
    value: ROLE_NAMES.JOCKEY,
    label: 'Jockey',
    description: 'Receive race invitations, confirm assignments, view race schedule, results, rankings, and personal records.'
  },
  {
    value: ROLE_NAMES.RACE_REFEREE,
    label: 'Race Referee',
    description: 'Inspect horses, monitor races, record violations, confirm race results, and create referee reports.'
  },
  {
    value: ROLE_NAMES.SPECTATOR,
    label: 'Spectator',
    description: 'View tournaments, race schedules, live results, rankings, predictions, and prediction rewards.'
  }
];

const ROLE_VALUES = ROLE_OPTIONS.map(function(role) {
  return role.value;
});

const PROFILE_ROLE_VALUES = [
  ROLE_NAMES.HORSE_OWNER,
  ROLE_NAMES.JOCKEY,
  ROLE_NAMES.RACE_REFEREE
];

module.exports = {
  ROLE_NAMES,
  ROLE_OPTIONS,
  ROLE_VALUES,
  PROFILE_ROLE_VALUES
};
