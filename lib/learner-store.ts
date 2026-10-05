import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { desc } from "drizzle-orm";
import type { ConversationTurn } from "../packages/protocol/src/conversation-turn.ts";
import type { EvidenceEvent } from "../packages/protocol/src/evidence-event.ts";
import type { ReplyAnalysis, ResponsePreferences, SenseId } from "../packages/protocol/src/comprehension.ts";
import { DEFAULT_RESPONSE_PREFERENCES, PREFERENCE_BOUNDS, STARTER_SET, validResponsePreferences } from "../packages/protocol/src/comprehension.ts";
import type { AssistantReply } from "./chat-types.ts";
import type { PersistedAppSettings } from "./llm-config.ts";
import { deriveCorrectedItemState, deriveItemState, type Decision } from "./evidence-policy.ts";
import type { CorrectedLearnerItemRead } from "../packages/protocol/src/comprehension.ts";
import { WORKFLOW_VERSION, type StageCheckpoint, type WorkflowStage, type WorkflowStageRecord, type WorkflowStageStatus } from "../packages/protocol/src/workflow.ts";

const turnsTable = sqliteTable("conversation_turn", { sequence: integer("sequence").primaryKey(), id: text("id").notNull(), body: text("body").notNull() });

export type Submission = {
  id: string; turn: ConversationTurn; preferences: ResponsePreferences;
  evidenceDone: boolean; stateRevision: string | null; snapshotRevision?: string; reply: AssistantReply | null;
};
export class StoreError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

/** One local installation. No request or model argument can change learner scope. */
export class LearnerStore {
  private readonly sql: DatabaseSync;
  private readonly orm;
  constructor(path = resolve(process.env.UNJOT_DATA_DIR || ".local", "learner.sqlite")) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.sql = new DatabaseSync(path);
    this.orm = drizzle(async (query, params, method) => {
      const statement = this.sql.prepare(query);
      if (method === "run") { statement.run(...params); return { rows: [] }; }
      statement.setReturnArrays(true);
      const rows = method === "get" ? statement.get(...params) : statement.all(...params);
      return { rows: (rows ?? []) as unknown as unknown[] };
    });
    this.sql.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    const version = Number(this.sql.prepare("PRAGMA user_version").get()!.user_version);
    if (version > 5) throw new Error("Learner database is newer than this application.");
    if (version === 0) this.transaction(() => {
      this.sql.exec(`
        CREATE TABLE settings (key TEXT PRIMARY KEY, body TEXT NOT NULL);
        CREATE TABLE conversation_turn (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, conversation_id TEXT NOT NULL, body TEXT NOT NULL);
        CREATE TABLE submission (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, body TEXT NOT NULL, finished INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0, owner TEXT);
        CREATE TABLE evidence_event (ordinal INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, item_id TEXT NOT NULL, turn_id TEXT NOT NULL REFERENCES conversation_turn(id), conversation_id TEXT NOT NULL, state_revision INTEGER NOT NULL, body TEXT NOT NULL);
        CREATE INDEX evidence_item ON evidence_event(item_id, ordinal);
        CREATE INDEX evidence_conversation ON evidence_event(conversation_id);
        CREATE INDEX turn_conversation ON conversation_turn(conversation_id);
        CREATE INDEX submission_conversation ON submission(conversation_id);
        CREATE TABLE learner_item_state (item_id TEXT PRIMARY KEY, revision TEXT NOT NULL, body TEXT NOT NULL);
        CREATE TABLE observation_decision (submission_id TEXT PRIMARY KEY REFERENCES submission(id), body TEXT NOT NULL);
        CREATE TABLE reply_analysis (assistant_turn_id TEXT PRIMARY KEY REFERENCES conversation_turn(id), contract_version TEXT NOT NULL, body TEXT NOT NULL);
        CREATE TABLE workflow_stage (submission_id TEXT NOT NULL REFERENCES submission(id), stage TEXT NOT NULL, attempt INTEGER NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (submission_id, stage));
        CREATE TABLE workflow_run (id TEXT PRIMARY KEY, kind TEXT NOT NULL, context_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE project (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE conversation (id TEXT PRIMARY KEY, project_id TEXT REFERENCES project(id) ON DELETE SET NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX conversation_project ON conversation(project_id, updated_at DESC);
        PRAGMA user_version=5;
      `);
      this.setting("device", randomUUID()); this.setting("conversation-context", randomUUID()); this.setting("preferences", DEFAULT_RESPONSE_PREFERENCES); this.setting("correction", false); this.setting("evidence-revision", 0);
    });
    if (version === 1) this.transaction(() => {
      this.sql.exec("CREATE TABLE workflow_stage (submission_id TEXT NOT NULL REFERENCES submission(id), stage TEXT NOT NULL, attempt INTEGER NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (submission_id, stage)); PRAGMA user_version=2;");
      this.sql.prepare("INSERT OR IGNORE INTO settings(key,body) VALUES (?,?)").run("conversation-context", JSON.stringify(randomUUID()));
    });
    if (version > 0 && version <= 2) this.transaction(() => { this.sql.exec("CREATE TABLE IF NOT EXISTS workflow_run (id TEXT PRIMARY KEY, kind TEXT NOT NULL, context_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL); PRAGMA user_version=3;"); });
    if (version > 0 && version <= 3) this.transaction(() => { this.sql.exec("CREATE TABLE IF NOT EXISTS project (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS conversation (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id), title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0); CREATE INDEX IF NOT EXISTS conversation_project ON conversation(project_id, updated_at DESC); PRAGMA user_version=4;"); this.ensureWorkspace(); });
    if (version > 0 && version <= 4) this.transaction(() => {
      this.sql.exec(`
        CREATE TABLE conversation_v5 (id TEXT PRIMARY KEY, project_id TEXT REFERENCES project(id) ON DELETE SET NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
        INSERT INTO conversation_v5 SELECT id,project_id,title,created_at,updated_at,archived FROM conversation;
        DROP TABLE conversation;
        ALTER TABLE conversation_v5 RENAME TO conversation;
        CREATE INDEX conversation_project ON conversation(project_id, updated_at DESC);
        ALTER TABLE conversation_turn ADD COLUMN conversation_id TEXT NOT NULL DEFAULT '';
        UPDATE conversation_turn SET conversation_id=json_extract(body,'$.conversationId');
        CREATE INDEX turn_conversation ON conversation_turn(conversation_id);
        ALTER TABLE submission ADD COLUMN conversation_id TEXT NOT NULL DEFAULT '';
        UPDATE submission SET conversation_id=json_extract(body,'$.turn.conversationId');
        CREATE INDEX submission_conversation ON submission(conversation_id);
        ALTER TABLE evidence_event ADD COLUMN conversation_id TEXT NOT NULL DEFAULT '';
        UPDATE evidence_event SET conversation_id=json_extract(body,'$.conversationId');
        ALTER TABLE evidence_event ADD COLUMN state_revision INTEGER NOT NULL DEFAULT 0;
        UPDATE evidence_event SET state_revision=ordinal;
        CREATE INDEX evidence_conversation ON evidence_event(conversation_id);
        PRAGMA user_version=5;
      `);
      const maxRevision = Number(this.sql.prepare("SELECT COALESCE(MAX(ordinal),0) AS n FROM evidence_event").get()!.n);
      this.setting("evidence-revision", maxRevision);
    });
    this.ensureWorkspace();
  }
  close() { this.sql.close(); }
  turn(id: string): ConversationTurn | null {
    const row = this.sql.prepare("SELECT body FROM conversation_turn WHERE id=?").get(id);
    return row ? JSON.parse(String(row.body)) : null;
  }
  private transaction<T>(fn: () => T): T {
    this.sql.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.sql.exec("COMMIT"); return result; }
    catch (error) { this.sql.exec("ROLLBACK"); throw error; }
  }
  private setting(key: string, value: unknown) { this.sql.prepare("INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body").run(key, JSON.stringify(value)); }
  private readSetting<T>(key: string): T { return JSON.parse(String(this.sql.prepare("SELECT body FROM settings WHERE key=?").get(key)!.body)); }
  get deviceId(): string { return this.readSetting("device"); }
  get contextId(): string { return this.readSetting("conversation-context"); }
  createWorkflowContext(kind: "scenario" | "explain" | "rewrite" | "reading" | "listening" | "review"): string { return `${kind}:${randomUUID()}`; }
  saveWorkflowRun(input: { id: string; kind: string; contextId: string; body: unknown }) {
    if (!input.id || input.id.length > 200 || !input.kind || !input.contextId) throw new StoreError("Invalid workflow run.");
    this.sql.prepare("INSERT INTO workflow_run(id,kind,context_id,body,created_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(input.id, input.kind, input.contextId, JSON.stringify(input.body), new Date().toISOString());
  }
  workflowRun(id: string) {
    const row = this.sql.prepare("SELECT id,kind,context_id,body,created_at FROM workflow_run WHERE id=?").get(id);
    return row ? { id: String(row.id), kind: String(row.kind), contextId: String(row.context_id), body: JSON.parse(String(row.body)), createdAt: String(row.created_at) } : null;
  }
  workflowRuns(kind?: string) {
    const rows = kind ? this.sql.prepare("SELECT id,kind,context_id,body,created_at FROM workflow_run WHERE kind=? ORDER BY created_at DESC").all(kind) : this.sql.prepare("SELECT id,kind,context_id,body,created_at FROM workflow_run ORDER BY created_at DESC").all();
    return rows.map(row => ({ id: String(row.id), kind: String(row.kind), contextId: String(row.context_id), body: JSON.parse(String(row.body)), createdAt: String(row.created_at) }));
  }
  preferences(): ResponsePreferences {
    const raw = this.readSetting<Partial<ResponsePreferences> & { maxNewExpressions?: unknown }>("preferences");
    const migrated: ResponsePreferences = {
      ...DEFAULT_RESPONSE_PREFERENCES,
      ...raw,
      contractVersion: DEFAULT_RESPONSE_PREFERENCES.contractVersion,
      complexityPolicyVersion: DEFAULT_RESPONSE_PREFERENCES.complexityPolicyVersion,
      maxUnfamiliarRatio: typeof raw.maxUnfamiliarRatio === "number" && Number.isFinite(raw.maxUnfamiliarRatio)
        ? Math.max(PREFERENCE_BOUNDS.minRatio, Math.min(PREFERENCE_BOUNDS.maxRatio, raw.maxUnfamiliarRatio))
        : DEFAULT_RESPONSE_PREFERENCES.maxUnfamiliarRatio,
      orchestrationMode: raw.orchestrationMode === "stepwise" ? "stepwise" : "synthesis",
      starterSetVersion: raw.startingLevel ? STARTER_SET.version : null,
    };
    return migrated;
  }
  correctionMode(): boolean { return this.readSetting("correction"); }
  appSettings(): PersistedAppSettings | null {
    const row = this.sql.prepare("SELECT body FROM settings WHERE key=?").get("app-settings");
    return row ? JSON.parse(String(row.body)) as PersistedAppSettings : null;
  }
  interfaceLanguage(): "zh" | "en" | null {
    const row = this.sql.prepare("SELECT body FROM settings WHERE key=?").get("interface-language");
    if (!row) return this.appSettings()?.language ?? null;
    const language = JSON.parse(String(row.body));
    return language === "zh" || language === "en" ? language : null;
  }
  saveInterfaceLanguage(language: "zh" | "en"): void {
    this.setting("interface-language", language);
  }
  saveAppSettings(value: PersistedAppSettings): PersistedAppSettings {
    const provider = value.provider.trim();
    const model = value.model.trim();
    const apiKey = value.apiKey.trim();
    const baseUrl = value.baseUrl.trim().replace(/\/+$/, "");
    if (!provider || provider.length > 100 || model.length > 300 || apiKey.length > 10_000 || baseUrl.length > 2_000 || (value.language !== "zh" && value.language !== "en")) throw new StoreError("Invalid application settings.");
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new Error();
    } catch { throw new StoreError("Base URL must use HTTPS, or localhost for a local provider."); }
    const settings = { provider, model, apiKey, baseUrl, language: value.language } satisfies PersistedAppSettings;
    this.setting("app-settings", settings);
    this.saveInterfaceLanguage(settings.language);
    return settings;
  }
  clearAppSettings(): void {
    const language = this.interfaceLanguage();
    if (language) this.saveInterfaceLanguage(language);
    this.sql.prepare("DELETE FROM settings WHERE key=?").run("app-settings");
  }
  clearUserData(): void {
    this.transaction(() => {
      const active = this.sql.prepare("SELECT id FROM submission WHERE finished=0 AND lease_until>? LIMIT 1").get(Date.now());
      if (active) throw new StoreError("Wait for the current response before clearing user data.", 409);
      this.sql.exec(`
        DELETE FROM reply_analysis;
        DELETE FROM observation_decision;
        DELETE FROM workflow_stage;
        DELETE FROM evidence_event;
        DELETE FROM submission;
        DELETE FROM conversation_turn;
        DELETE FROM workflow_run;
        DELETE FROM learner_item_state;
        DELETE FROM conversation;
        DELETE FROM project;
        DELETE FROM settings;
        DELETE FROM sqlite_sequence WHERE name IN ('conversation_turn', 'evidence_event');
      `);
      this.setting("device", randomUUID());
      this.setting("conversation-context", randomUUID());
      this.setting("preferences", DEFAULT_RESPONSE_PREFERENCES);
      this.setting("correction", false);
      this.setting("evidence-revision", 0);
      this.ensureWorkspace();
    });
  }
  savePreferences(patch: Record<string, unknown>): ResponsePreferences {
    const allowed = ["maxUnfamiliarRatio", "maxNewExpressions", "allowChineseSupport", "startingLevel", "orchestrationMode", "correctionMode"];
    if (!Object.keys(patch).length || Object.keys(patch).some(k => !allowed.includes(k))) throw new StoreError("Unsupported preference field.");
    return this.transaction(() => {
      const { correctionMode, maxNewExpressions: _legacyDistinctLimit, ...responsePatch } = patch;
      const next = { ...this.preferences(), ...responsePatch, profileVersion: randomUUID() } as ResponsePreferences;
      next.starterSetVersion = next.startingLevel ? STARTER_SET.version : null;
      if (!validResponsePreferences(next) || (correctionMode !== undefined && typeof correctionMode !== "boolean") || (next.orchestrationMode !== "synthesis" && next.orchestrationMode !== "stepwise")) throw new StoreError("Invalid response preferences.");
      this.setting("preferences", next);
      if (correctionMode !== undefined) this.setting("correction", correctionMode);
      return next;
    });
  }
  turns(limit = 100): ConversationTurn[] {
    return this.sql.prepare("SELECT body FROM conversation_turn ORDER BY sequence DESC LIMIT ?").all(limit).reverse().map(r => JSON.parse(String(r.body)));
  }
  conversationTurns(conversationId: string, limit = 100): ConversationTurn[] {
    return this.sql.prepare("SELECT body FROM conversation_turn ORDER BY sequence DESC LIMIT ?").all(limit * 3)
      .map(r => JSON.parse(String(r.body)) as ConversationTurn)
      .filter(turn => turn.conversationId === conversationId)
      .slice(0, limit)
      .reverse();
  }
  async historyPage(limit = 100): Promise<ConversationTurn[]> {
    const rows = await this.orm.select().from(turnsTable).orderBy(desc(turnsTable.sequence)).limit(limit);
    return rows.reverse().map(row => JSON.parse(row.body));
  }
  projects() { return this.sql.prepare("SELECT id,name,created_at AS createdAt,updated_at AS updatedAt FROM project WHERE archived=0 ORDER BY updated_at DESC").all(); }
  conversations(projectId?: string) { const sql = projectId ? "SELECT id,project_id AS projectId,title,created_at AS createdAt,updated_at AS updatedAt FROM conversation WHERE project_id=? AND archived=0 ORDER BY updated_at DESC" : "SELECT id,project_id AS projectId,title,created_at AS createdAt,updated_at AS updatedAt FROM conversation WHERE archived=0 ORDER BY updated_at DESC"; return this.sql.prepare(sql).all(...(projectId ? [projectId] : [])); }
  archivedConversations() { return this.sql.prepare("SELECT id,project_id AS projectId,title,created_at AS createdAt,updated_at AS updatedAt FROM conversation WHERE archived=1 ORDER BY updated_at DESC").all(); }
  createProject(name = "My language") { const id = randomUUID(), now = new Date().toISOString(); this.sql.prepare("INSERT INTO project VALUES (?,?,?,?,0)").run(id, name.trim() || "My language", now, now); return this.projects().find((p: any) => p.id === id); }
  createConversation(projectId: string | null = null, title = "New conversation") { if (projectId && !this.sql.prepare("SELECT id FROM project WHERE id=? AND archived=0").get(projectId)) throw new StoreError("Project not found.", 404); const id = randomUUID(), now = new Date().toISOString(); this.sql.prepare("INSERT INTO conversation(id,project_id,title,created_at,updated_at,archived) VALUES (?,?,?,?,?,0)").run(id, projectId, title.trim() || "New conversation", now, now); return this.conversations().find((c: any) => c.id === id); }
  renameProject(id: string, name: string) { this.sql.prepare("UPDATE project SET name=?,updated_at=? WHERE id=? AND archived=0").run(name.trim() || "My language", new Date().toISOString(), id); return this.projects().find((p: any) => p.id === id) ?? null; }
  renameConversation(id: string, title: string) { this.sql.prepare("UPDATE conversation SET title=?,updated_at=? WHERE id=? AND archived=0").run(title.trim() || "New conversation", new Date().toISOString(), id); return this.conversations().find((c: any) => c.id === id) ?? null; }
  moveConversation(id: string, projectId: string | null) {
    if (projectId && !this.sql.prepare("SELECT id FROM project WHERE id=? AND archived=0").get(projectId)) throw new StoreError("Project not found.", 404);
    const now = new Date().toISOString();
    const result = this.transaction(() => {
      const changed = this.sql.prepare("UPDATE conversation SET project_id=?,updated_at=? WHERE id=? AND archived=0").run(projectId, now, id);
      if (!changed.changes) throw new StoreError("Conversation not found.", 404);
      if (projectId) this.sql.prepare("UPDATE project SET updated_at=? WHERE id=?").run(now, projectId);
      return this.conversations().find((conversation: any) => conversation.id === id) ?? null;
    });
    return result;
  }
  dissolveProject(id: string) { this.transaction(() => { const result = this.sql.prepare("UPDATE project SET archived=1,updated_at=? WHERE id=? AND archived=0").run(new Date().toISOString(), id); if (!result.changes) throw new StoreError("Project not found.", 404); this.sql.prepare("UPDATE conversation SET project_id=NULL,updated_at=? WHERE project_id=?").run(new Date().toISOString(), id); }); }
  archiveConversation(id: string) {
    const result = this.sql.prepare("UPDATE conversation SET archived=1,updated_at=? WHERE id=? AND archived=0").run(new Date().toISOString(), id);
    if (!result.changes) throw new StoreError("Conversation not found.", 404);
    this.ensureWorkspace();
  }
  restoreConversation(id: string) { const result = this.sql.prepare("UPDATE conversation SET archived=0,updated_at=? WHERE id=? AND archived=1").run(new Date().toISOString(), id); if (!result.changes) throw new StoreError("Archived conversation not found.", 404); return this.conversations().find((conversation: any) => conversation.id === id) ?? null; }
  deleteConversation(id: string) {
    return this.transaction(() => {
      if (!this.sql.prepare("SELECT id FROM conversation WHERE id=?").get(id)) throw new StoreError("Conversation not found.", 404);
      if (this.sql.prepare("SELECT id FROM submission WHERE conversation_id=? AND finished=0 LIMIT 1").get(id)) throw new StoreError("Wait for the current response before deleting this conversation.", 409);
      const affectedItems = this.sql.prepare("SELECT DISTINCT item_id AS itemId FROM evidence_event WHERE conversation_id=?").all(id).map(row => String(row.itemId));
      const evidenceCount = Number(this.sql.prepare("SELECT COUNT(*) AS n FROM evidence_event WHERE conversation_id=?").get(id)!.n);
      this.sql.prepare("DELETE FROM reply_analysis WHERE assistant_turn_id IN (SELECT id FROM conversation_turn WHERE conversation_id=?)").run(id);
      this.sql.prepare("DELETE FROM observation_decision WHERE submission_id IN (SELECT id FROM submission WHERE conversation_id=?)").run(id);
      this.sql.prepare("DELETE FROM workflow_stage WHERE submission_id IN (SELECT id FROM submission WHERE conversation_id=?)").run(id);
      this.sql.prepare("DELETE FROM evidence_event WHERE conversation_id=?").run(id);
      this.sql.prepare("DELETE FROM submission WHERE conversation_id=?").run(id);
      this.sql.prepare("DELETE FROM conversation_turn WHERE conversation_id=?").run(id);
      this.sql.prepare("DELETE FROM conversation WHERE id=?").run(id);
      if (evidenceCount) {
        const revision = String(Number(this.revision()) + 1);
        this.setting("evidence-revision", Number(revision));
        for (const itemId of affectedItems) {
          const state = deriveItemState(itemId as SenseId, this.evidence(revision, itemId as SenseId));
          if (state) this.sql.prepare("INSERT INTO learner_item_state VALUES (?,?,?) ON CONFLICT(item_id) DO UPDATE SET revision=excluded.revision,body=excluded.body").run(itemId, revision, JSON.stringify(state));
          else this.sql.prepare("DELETE FROM learner_item_state WHERE item_id=?").run(itemId);
        }
      }
      this.ensureWorkspace(false);
      return { deletedEvidence: evidenceCount };
    });
  }
  private ensureWorkspace(useStableLocalId = true) {
    let project = this.sql.prepare("SELECT id FROM project WHERE archived=0 ORDER BY updated_at DESC LIMIT 1").get() as { id?: string } | undefined;
    const projectCount = Number(this.sql.prepare("SELECT COUNT(*) AS n FROM project").get()!.n);
    if (!project?.id && projectCount === 0) {
      const id = randomUUID(), now = new Date().toISOString();
      this.sql.prepare("INSERT INTO project VALUES (?,?,?,?,0)").run(id, "My language", now, now);
      project = { id };
    }
    const conversation = this.sql.prepare("SELECT id FROM conversation WHERE archived=0 ORDER BY updated_at DESC LIMIT 1").get() as { id?: string } | undefined;
    if (!conversation?.id) {
      const localIdAvailable = !this.sql.prepare("SELECT id FROM conversation WHERE id=?").get("local-conversation");
      const id = useStableLocalId && localIdAvailable ? "local-conversation" : randomUUID();
      const projectId = project?.id ? String(project.id) : null;
      const now = new Date().toISOString();
      this.sql.prepare("INSERT INTO conversation(id,project_id,title,created_at,updated_at,archived) VALUES (?,?,?,?,?,0)").run(id, projectId, "Conversation", now, now);
    }
  }
  defaultConversationId() {
    this.ensureWorkspace();
    return String(this.sql.prepare("SELECT id FROM conversation WHERE archived=0 ORDER BY updated_at DESC LIMIT 1").get()!.id);
  }
  private insertTurn(turn: ConversationTurn) { this.sql.prepare("INSERT INTO conversation_turn(sequence,id,conversation_id,body) VALUES (?,?,?,?)").run(turn.sequence, turn.id, turn.conversationId, JSON.stringify(turn)); }
  private nextSequence(): number { return Number(this.sql.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM conversation_turn").get()!.n); }
  private upsertStage(id: string, stage: WorkflowStage, status: WorkflowStageStatus, body: unknown = null) {
    const previous = this.sql.prepare("SELECT attempt FROM workflow_stage WHERE submission_id=? AND stage=?").get(id, stage) as { attempt?: number } | undefined;
    const attempt = Number(previous?.attempt ?? 0) + 1;
    this.sql.prepare("INSERT INTO workflow_stage(submission_id,stage,attempt,status,body,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(submission_id,stage) DO UPDATE SET attempt=excluded.attempt,status=excluded.status,body=excluded.body,updated_at=excluded.updated_at").run(id, stage, attempt, status, JSON.stringify(body), new Date().toISOString());
  }
  recordStage(id: string, owner: string, stage: WorkflowStage, status: WorkflowStageStatus, body: unknown = null) {
    this.transaction(() => { this.checkOwner(id, owner); this.upsertStage(id, stage, status, body); });
  }
  checkpoint(id: string, owner: string): StageCheckpoint {
    return { run: async <T>(stage: "observations_proposed" | "observations_validated", task: () => Promise<T>): Promise<T> => {
      const saved = this.workflowStages(id).find(s => s.stage === stage && s.status === "accepted");
      if (saved) return saved.body as T;
      try {
        const result = await task();
        this.recordStage(id, owner, stage, "accepted", result);
        return result;
      } catch (error) {
        this.recordStage(id, owner, stage, "retryable_error", null);
        throw error;
      }
    } };
  }
  workflowStages(id: string): WorkflowStageRecord[] {
    return this.sql.prepare("SELECT submission_id,stage,attempt,status,body,updated_at FROM workflow_stage WHERE submission_id=? ORDER BY rowid").all(id).map(row => {
      const body = JSON.parse(String(row.body)) as { reason?: string } | null;
      const reason = body?.reason ?? "";
      const reasonCode = row.status !== "retryable_error" ? "validated" : /invalid|structured|budget/i.test(reason) ? "invalid_model_output" : "model_unavailable";
      return { version: WORKFLOW_VERSION, submissionId: String(row.submission_id), stage: row.stage as WorkflowStage, attempt: Number(row.attempt), status: row.status as WorkflowStageStatus, reasonCode, policyVersion: "m4-evidence-v1", inputRefs: [id], outputRefs: [], body, updatedAt: String(row.updated_at) };
    });
  }
  getSubmission(id: string): Submission | null {
    const row = this.sql.prepare("SELECT body FROM submission WHERE id=?").get(id);
    if (!row) return null;
    const submission = JSON.parse(String(row.body)) as Submission;
    if (!submission.snapshotRevision) submission.snapshotRevision = submission.stateRevision ?? "0";
    return submission;
  }
  private putSubmission(s: Submission) { this.sql.prepare("UPDATE submission SET body=?,finished=? WHERE id=?").run(JSON.stringify(s), s.reply ? 1 : 0, s.id); }
  begin(id: string, original: string, correctionMode: boolean, conversationId = this.defaultConversationId()): Submission {
    if (!id || id.length > 200 || !original.trim() || original.length > 4000 || typeof correctionMode !== "boolean") throw new StoreError("Invalid submission.");
    return this.transaction(() => {
      const existing = this.getSubmission(id);
      if (existing) {
        if (existing.turn.text !== original || existing.turn.correctionMode !== correctionMode) throw new StoreError("Submission ID already belongs to different input.", 409);
        return existing;
      }
      if (this.sql.prepare("SELECT id FROM submission WHERE finished=0 AND conversation_id=? LIMIT 1").get(conversationId)) throw new StoreError("Retry the unfinished message before sending another.", 409);
      if (!this.sql.prepare("SELECT id FROM conversation WHERE id=? AND archived=0").get(conversationId)) throw new StoreError("Conversation not found.", 404);
      const turn: ConversationTurn = { id, conversationId, sequence: this.nextSequence(), role: "learner", contextId: this.contextId, text: original, occurredAt: new Date().toISOString(), suppliedItemIds: [], correctionMode, correction: null };
      const snapshotRevision = this.revision();
      const submission: Submission = { id, turn, preferences: this.preferences(), evidenceDone: false, stateRevision: snapshotRevision, snapshotRevision, reply: null };
      this.insertTurn(turn);
      this.sql.prepare("INSERT INTO submission(id,conversation_id,body) VALUES (?,?,?)").run(id, conversationId, JSON.stringify(submission));
      this.upsertStage(id, "captured", "accepted", { turnId: turn.id, preferences: submission.preferences });
      this.upsertStage(id, "snapshot_pinned", "accepted", { stateRevision: snapshotRevision, profileVersion: submission.preferences.profileVersion });
      return submission;
    });
  }
  claim(id: string): string {
    const owner = randomUUID();
    const result = this.sql.prepare("UPDATE submission SET owner=?,lease_until=? WHERE id=? AND lease_until<? AND finished=0").run(owner, Date.now() + 600_000, id, Date.now());
    if (!result.changes) throw new StoreError("This submission is already being processed. Retry shortly.", 409);
    return owner;
  }
  release(id: string, owner: string) { this.sql.prepare("UPDATE submission SET lease_until=0,owner=NULL WHERE id=? AND owner=?").run(id, owner); }
  private checkOwner(id: string, owner: string) {
    if (!this.sql.prepare("SELECT id FROM submission WHERE id=? AND owner=? AND lease_until>?").get(id, owner, Date.now())) throw new StoreError("Submission lease expired. Retry the saved message.", 409);
  }
  revision(): string { return String(this.readSetting<number>("evidence-revision")); }
  evidence(revision = this.revision(), itemId?: SenseId): EvidenceEvent[] {
    if (typeof revision !== "string" || !/^\d+$/.test(revision) || !Number.isSafeInteger(Number(revision)) || Number(revision) > Number(this.revision())) throw new StoreError("Invalid state revision.");
    return this.sql.prepare(`SELECT body FROM evidence_event WHERE state_revision<=?${itemId ? " AND item_id=?" : ""} ORDER BY ordinal`).all(...(itemId ? [Number(revision), itemId] : [Number(revision)])).map(r => JSON.parse(String(r.body)));
  }
  private append(events: readonly EvidenceEvent[]) {
    const revision = Number(this.revision()) + 1;
    const inserted: EvidenceEvent[] = [];
    for (const e of events) {
      const result = this.sql.prepare("INSERT OR IGNORE INTO evidence_event(id,item_id,turn_id,conversation_id,state_revision,body) VALUES (?,?,?,?,?,?)").run(e.id, e.itemId, e.turnId, e.conversationId, revision, JSON.stringify(e));
      if (result.changes) inserted.push(e);
    }
    if (inserted.length) this.setting("evidence-revision", revision);
    for (const id of new Set(inserted.map(e => e.itemId))) {
      const state = deriveItemState(id, this.evidence(this.revision(), id));
      this.sql.prepare("INSERT INTO learner_item_state VALUES (?,?,?) ON CONFLICT(item_id) DO UPDATE SET revision=excluded.revision,body=excluded.body").run(id, this.revision(), JSON.stringify(state));
    }
  }
  accept(id: string, owner: string, decisions: readonly Decision[]): Submission {
    return this.transaction(() => {
      this.checkOwner(id, owner);
      const s = this.getSubmission(id)!;
      if (s.evidenceDone) return s;
      this.append(decisions.flatMap(d => d.event ? [d.event] : []));
      this.sql.prepare("INSERT INTO observation_decision VALUES (?,?)").run(id, JSON.stringify(decisions));
      this.upsertStage(id, "evidence_committed", "accepted", { stateRevision: this.revision(), accepted: decisions.filter(d => d.event).length });
      s.evidenceDone = true; s.stateRevision = this.revision(); this.putSubmission(s); return s;
    });
  }
  /** Commit a completed Evidence lane after response publication. Idempotent by submission. */
  commitEvidence(id: string, decisions: readonly Decision[]): Submission {
    return this.transaction(() => {
      const s = this.getSubmission(id);
      if (!s) throw new StoreError("Unknown submission.", 404);
      if (s.evidenceDone) return s;
      this.append(decisions.flatMap(d => d.event ? [d.event] : []));
      this.sql.prepare("INSERT OR IGNORE INTO observation_decision VALUES (?,?)").run(id, JSON.stringify(decisions));
      this.upsertStage(id, "evidence_committed", "accepted", { stateRevision: this.revision(), accepted: decisions.filter(d => d.event).length });
      s.evidenceDone = true; s.stateRevision = this.revision(); this.putSubmission(s); return s;
    });
  }
  finish(id: string, owner: string, reply: AssistantReply, assistant: ConversationTurn, decisions: readonly Decision[], analysis?: ReplyAnalysis) {
    return this.transaction(() => {
      this.checkOwner(id, owner);
      const s = this.getSubmission(id)!;
      if (s.reply) return s.reply;
      const savedAssistant = { ...assistant, sequence: this.nextSequence() };
      this.insertTurn(savedAssistant);
      this.append(decisions.flatMap(d => d.event ? [d.event] : []));
      const savedAnalysis = analysis ? { ...analysis, assistantTurnId: savedAssistant.id } : undefined;
      if (savedAnalysis) this.sql.prepare("INSERT INTO reply_analysis VALUES (?,?,?)").run(savedAssistant.id, savedAnalysis.contractVersion, JSON.stringify(savedAnalysis));
      this.upsertStage(id, "reply_planned", "accepted", { plan: savedAnalysis?.plan ?? null });
      this.upsertStage(id, "reply_generated", "accepted", { assistantTurnId: savedAssistant.id, analysis: savedAnalysis ?? null });
      this.upsertStage(id, "reply_checked", "accepted", { assistantTurnId: savedAssistant.id, analysis: savedAnalysis ?? null });
      this.upsertStage(id, "support_validated", "accepted", { supplied: decisions.filter(d => d.event).length });
      this.upsertStage(id, "published", "accepted", { assistantTurnId: savedAssistant.id });
      s.reply = { ...reply, assistantTurn: savedAssistant, analysis: savedAnalysis }; this.putSubmission(s); return s.reply;
    });
  }
  pending(conversationId?: string): Submission | null {
    return this.pendingStatus(conversationId)?.submission ?? null;
  }
  pendingStatus(conversationId?: string): { submission: Submission; processing: boolean } | null {
    const row = conversationId
      ? this.sql.prepare("SELECT body,owner,lease_until FROM submission WHERE finished=0 AND conversation_id=? LIMIT 1").get(conversationId)
      : this.sql.prepare("SELECT body,owner,lease_until FROM submission WHERE finished=0 LIMIT 1").get();
    if (!row) return null;
    return {
      submission: JSON.parse(String(row.body)),
      processing: Boolean(row.owner) && Number(row.lease_until) > Date.now(),
    };
  }
  inspect() {
    const events = this.evidence();
    const ids = [...new Set([...events].reverse().map(e => e.itemId))];
    const items = ids.slice(0, 100).map(id => ({ state: deriveItemState(id, events), evidence: events.filter(e => e.itemId === id).slice(-50).map(e => {
      const turn = this.turn(e.turnId);
      const text = e.textSource === "correction" ? turn?.correction?.text : turn?.text;
      return { ...e, originalText: text ?? null, quote: text?.slice(e.observedSpan.start, e.observedSpan.end) ?? null };
    }) }));
    return { stateRevision: this.revision(), items, totalItems: ids.length, decisions: this.sql.prepare("SELECT body FROM observation_decision ORDER BY rowid DESC LIMIT 20").all().map(r => JSON.parse(String(r.body))) };
  }
  states(itemIds?: readonly SenseId[]) {
    const ids = itemIds?.slice(0, 100);
    const rows = ids?.length
      ? this.sql.prepare(`SELECT item_id,body FROM learner_item_state WHERE item_id IN (${ids.map(() => "?").join(",")})`).all(...ids)
      : this.sql.prepare("SELECT item_id,body FROM learner_item_state ORDER BY item_id LIMIT 100").all();
    return rows.map(row => JSON.parse(String(row.body)));
  }
  correctedStates(itemIds: readonly SenseId[] | undefined, revision = this.revision()): CorrectedLearnerItemRead[] {
    const events = this.evidence(revision);
    const ids = itemIds?.length ? [...new Set(itemIds)].slice(0, 100) : [...new Set(events.map(e => e.itemId))].slice(-100);
    return ids.map(id => deriveCorrectedItemState(id, events, revision));
  }
  itemEvidence(itemId: SenseId, limit = 50) {
    if (limit < 1 || limit > 50) throw new StoreError("Evidence limit must be between 1 and 50.");
    return this.evidence(this.revision(), itemId).slice(-limit);
  }
  replyAnalysis(assistantTurnId: string): ReplyAnalysis | null {
    const row = this.sql.prepare("SELECT body FROM reply_analysis WHERE assistant_turn_id=?").get(assistantTurnId);
    return row ? JSON.parse(String(row.body)) as ReplyAnalysis : null;
  }
}

const local = globalThis as typeof globalThis & { unjotLearnerStore?: unknown };
export function learnerStore(): LearnerStore {
  const current = local.unjotLearnerStore;
  if (current instanceof LearnerStore) return current;
  if (current && typeof current === "object" && "close" in current && typeof current.close === "function") current.close();
  const next = new LearnerStore();
  local.unjotLearnerStore = next;
  return next;
}
