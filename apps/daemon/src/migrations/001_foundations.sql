CREATE TABLE repos (
  id TEXT PRIMARY KEY,
  root_path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  test_command TEXT,
  test_timeout_s INTEGER NOT NULL DEFAULT 900,
  test_env_allowlist TEXT NOT NULL DEFAULT '[]',
  junit_path TEXT,
  setup_command TEXT,
  created_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  runtime TEXT NOT NULL,
  model TEXT,
  tools TEXT NOT NULL,
  policy_overlay TEXT,
  attempt_budget_nusd INTEGER,
  allow_ungated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE missions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  objective TEXT,
  repo_id TEXT REFERENCES repos(id),
  state TEXT NOT NULL,
  budget_nusd INTEGER,
  spent_nusd INTEGER NOT NULL DEFAULT 0,
  spent_includes_estimated INTEGER NOT NULL DEFAULT 0,
  spent_includes_unknown INTEGER NOT NULL DEFAULT 0,
  budget_warned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  archived_at TEXT
);

CREATE TABLE mission_criteria (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE (mission_id, seq)
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id),
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  profile_id TEXT REFERENCES profiles(id),
  verifies_task_id TEXT REFERENCES tasks(id),
  state TEXT NOT NULL,
  unverified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (mission_id, seq)
);

CREATE TABLE task_deps (
  task_id TEXT NOT NULL REFERENCES tasks(id),
  depends_on_task_id TEXT NOT NULL REFERENCES tasks(id),
  PRIMARY KEY (task_id, depends_on_task_id)
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(id),
  path TEXT NOT NULL UNIQUE,
  branch TEXT NOT NULL,
  base_commit TEXT NOT NULL,
  state TEXT NOT NULL,
  lease_attempt_id TEXT,
  lease_expires_at TEXT,
  released_at TEXT,
  removed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX workspaces_one_active_lease
  ON workspaces (lease_attempt_id)
  WHERE state IN ('creating', 'leased', 'stale') AND lease_attempt_id IS NOT NULL;

CREATE UNIQUE INDEX workspaces_active_branch
  ON workspaces (repo_id, branch)
  WHERE state != 'removed';

CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  seq INTEGER NOT NULL,
  runtime TEXT NOT NULL,
  profile_snapshot TEXT NOT NULL,
  state TEXT NOT NULL,
  end_reason TEXT,
  workspace_id TEXT REFERENCES workspaces(id),
  runtime_session_id TEXT,
  pid INTEGER,
  proc_start_time TEXT,
  log_path TEXT,
  log_offset INTEGER NOT NULL DEFAULT 0,
  stderr_path TEXT,
  exit_code INTEGER,
  exit_signal TEXT,
  review_state TEXT NOT NULL DEFAULT 'none',
  review_note TEXT,
  override_reason TEXT,
  gated TEXT NOT NULL,
  base_dirty INTEGER NOT NULL DEFAULT 0,
  gate_token TEXT,
  verification_label TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (task_id, seq)
);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  tool TEXT NOT NULL,
  input_json TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  preview TEXT NOT NULL,
  matched_rule_ids TEXT NOT NULL,
  policy_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'once',
  reason TEXT,
  decided_by TEXT,
  actor TEXT,
  decided_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX approvals_state_expires ON approvals (state, expires_at);

CREATE TABLE gate_decisions (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  tool_use_ref TEXT,
  tool TEXT NOT NULL,
  arg TEXT,
  input_hash TEXT NOT NULL,
  effect TEXT NOT NULL,
  matched_rule_ids TEXT NOT NULL,
  policy_hash TEXT NOT NULL,
  source_layers TEXT NOT NULL,
  approval_id TEXT REFERENCES approvals(id),
  latency_ms INTEGER NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  mission_id TEXT,
  task_id TEXT,
  attempt_id TEXT,
  actor TEXT NOT NULL,
  payload TEXT NOT NULL,
  raw TEXT,
  raw_blob_sha256 TEXT
);

CREATE INDEX events_attempt ON events (attempt_id, id);
CREATE INDEX events_mission ON events (mission_id, id);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  kind TEXT NOT NULL,
  media_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  label TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE usage (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  turn_ref TEXT,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_nusd INTEGER,
  cost_source TEXT NOT NULL,
  price_table_version TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE attempt_grants (
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  input_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (attempt_id, input_hash)
);
