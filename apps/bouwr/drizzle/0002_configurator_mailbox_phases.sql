ALTER TABLE projects ADD COLUMN configuration TEXT;
ALTER TABLE projects ADD COLUMN document TEXT;
ALTER TABLE projects ADD COLUMN payment_schedule TEXT NOT NULL DEFAULT 'full';
ALTER TABLE messages ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX idx_messages_request ON messages(author,request_id);
CREATE TABLE dashboard_preferences (
  user TEXT PRIMARY KEY NOT NULL,
  widgets TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE TABLE configurator_drafts (
  user TEXT PRIMARY KEY NOT NULL,
  configuration TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE TABLE project_phases (
  id TEXT PRIMARY KEY NOT NULL,
  project TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  percentage INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created TEXT NOT NULL
);
CREATE INDEX idx_phases_project ON project_phases(project,position);
CREATE TABLE payment_intents (
  id TEXT PRIMARY KEY NOT NULL,
  project TEXT NOT NULL,
  phase TEXT,
  scope TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  fee INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'creating',
  provider_id TEXT,
  created TEXT NOT NULL,
  UNIQUE(project,scope,attempt)
);
ALTER TABLE payments ADD COLUMN phase TEXT REFERENCES project_phases(id);
ALTER TABLE payments ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1;
ALTER TABLE payments ADD COLUMN checkout TEXT;
DROP INDEX idx_payments_project;
CREATE UNIQUE INDEX idx_payments_active ON payments(project,IFNULL(phase,'full'))
  WHERE status IN ('open','pending','authorized','paid');
CREATE INDEX idx_payments_project ON payments(project,created);
CREATE TABLE mail_thread_states (
  user TEXT NOT NULL,
  thread TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT '',
  starred INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user,thread)
);
CREATE TABLE mail_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  user TEXT NOT NULL,
  kind TEXT NOT NULL,
  project TEXT,
  channel TEXT,
  recipient TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  reply_id TEXT,
  updated TEXT NOT NULL
);
CREATE INDEX idx_mail_drafts_user ON mail_drafts(user,updated);
CREATE TABLE outlook_connections (
  user TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  tokens TEXT NOT NULL,
  expires INTEGER NOT NULL,
  updated TEXT NOT NULL,
  generation TEXT NOT NULL
);
CREATE TABLE outlook_states (
  id TEXT PRIMARY KEY NOT NULL,
  user TEXT NOT NULL,
  verifier TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE outlook_messages (
  user TEXT NOT NULL,
  id TEXT NOT NULL,
  conversation TEXT NOT NULL DEFAULT '',
  folder TEXT NOT NULL,
  subject TEXT NOT NULL,
  sender TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  recipients TEXT NOT NULL,
  reply_to TEXT NOT NULL,
  preview TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read INTEGER NOT NULL,
  starred INTEGER NOT NULL DEFAULT 0,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  received TEXT NOT NULL,
  web_url TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(user,id)
);
CREATE INDEX idx_outlook_user_folder ON outlook_messages(user,folder,received);
CREATE TABLE outlook_sync (
  user TEXT NOT NULL,
  folder TEXT NOT NULL,
  cursor TEXT NOT NULL,
  synced TEXT NOT NULL,
  pending INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user,folder)
);
CREATE TABLE outlook_sync_locks (user TEXT PRIMARY KEY NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE mail_send_requests (
  user TEXT NOT NULL,
  id TEXT NOT NULL,
  status TEXT NOT NULL,
  remote_id TEXT,
  created TEXT NOT NULL,
  PRIMARY KEY(user,id)
);
