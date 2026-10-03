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
import { DEFAULT_RESPONSE_PREFERENCES, STARTER_SET, validResponsePreferences } from "../packages/protocol/src/comprehension.ts";
import type { AssistantReply } from "./chat-types.ts";
import { deriveCorrectedItemState, deriveItemState, type Decision } from "./evidence-policy.ts";
import type { CorrectedLearnerItemRead } from "../packages/protocol/src/comprehension.ts";
import { WORKFLOW_VERSION, type StageCheckpoint, type WorkflowStage, type WorkflowStageRecord, type WorkflowStageStatus } from "../packages/protocol/src/workflow.ts";

const turnsTable = sqliteTable("conversation_turn", { sequence: integer("sequence").primaryKey(), id: text("id").notNull(), body: text("body").notNull() });

export type Submission = {
  id: string; turn: ConversationTurn; preferences: ResponsePreferences;
  evidenceDone: boolean; stateRevision: string | null; reply: AssistantReply | null;
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
    if (version > 2) throw new Error("Learner database is newer than this application.");
    if (version === 0) this.transaction(() => {
      this.sql.exec(`
        CREATE TABLE settings (key TEXT PRIMARY KEY, body TEXT NOT NULL);
        CREATE TABLE conversation_turn (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, body TEXT NOT NULL);
        CREATE TABLE submission (id TEXT PRIMARY KEY, body TEXT NOT NULL, finished INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0, owner TEXT);
        CREATE TABLE evidence_event (ordinal INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, item_id TEXT NOT NULL, turn_id TEXT NOT NULL REFERENCES conversation_turn(id), body TEXT NOT NULL);
        CREATE INDEX evidence_item ON evidence_event(item_id, ordinal);
        CREATE TABLE learner_item_state (item_id TEXT PRIMARY KEY, revision TEXT NOT NULL, body TEXT NOT NULL);
        CREATE TABLE observation_decision (submission_id TEXT PRIMARY KEY REFERENCES submission(id), body TEXT NOT NULL);
        CREATE TABLE reply_analysis (assistant_turn_id TEXT PRIMARY KEY REFERENCES conversation_turn(id), contract_version TEXT NOT NULL, body TEXT NOT NULL);
        CREATE TABLE workflow_stage (submission_id TEXT NOT NULL REFERENCES submission(id), stage TEXT NOT NULL, attempt INTEGER NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (submission_id, stage));
        PRAGMA user_version=2;
      `);
      this.setting("device", randomUUID()); this.setting("conversation-context", randomUUID()); this.setting("preferences", DEFAULT_RESPONSE_PREFERENCES); this.setting("correction", false);
    });
    if (version === 1) this.transaction(() => {
      this.sql.exec("CREATE TABLE workflow_stage (submission_id TEXT NOT NULL REFERENCES submission(id), stage TEXT NOT NULL, attempt INTEGER NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (submission_id, stage)); PRAGMA user_version=2;");
      this.sql.prepare("INSERT OR IGNORE INTO settings(key,body) VALUES (?,?)").run("conversation-context", JSON.stringify(randomUUID()));
    });
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
  preferences(): ResponsePreferences { return this.readSetting("preferences"); }
  correctionMode(): boolean { return this.readSetting("correction"); }
  savePreferences(patch: Record<string, unknown>): ResponsePreferences {
    const allowed = ["maxUnfamiliarRatio", "maxNewExpressions", "allowChineseSupport", "startingLevel", "correctionMode"];
    if (!Object.keys(patch).length || Object.keys(patch).some(k => !allowed.includes(k))) throw new StoreError("Unsupported preference field.");
    return this.transaction(() => {
      const { correctionMode, ...responsePatch } = patch;
      const next = { ...this.preferences(), ...responsePatch, profileVersion: randomUUID() } as ResponsePreferences;
      next.starterSetVersion = next.startingLevel ? STARTER_SET.version : null;
      if (!validResponsePreferences(next) || (correctionMode !== undefined && typeof correctionMode !== "boolean")) throw new StoreError("Invalid response preferences.");
      this.setting("preferences", next);
      if (correctionMode !== undefined) this.setting("correction", correctionMode);
      return next;
    });
  }
  turns(limit = 100): ConversationTurn[] {
    return this.sql.prepare("SELECT body FROM conversation_turn ORDER BY sequence DESC LIMIT ?").all(limit).reverse().map(r => JSON.parse(String(r.body)));
  }
  async historyPage(limit = 100): Promise<ConversationTurn[]> {
    const rows = await this.orm.select().from(turnsTable).orderBy(desc(turnsTable.sequence)).limit(limit);
    return rows.reverse().map(row => JSON.parse(row.body));
  }
  private insertTurn(turn: ConversationTurn) { this.sql.prepare("INSERT INTO conversation_turn(sequence,id,body) VALUES (?,?,?)").run(turn.sequence, turn.id, JSON.stringify(turn)); }
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
    return this.sql.prepare("SELECT submission_id,stage,attempt,status,body,updated_at FROM workflow_stage WHERE submission_id=? ORDER BY rowid").all(id).map(row => ({ version: WORKFLOW_VERSION, submissionId: String(row.submission_id), stage: row.stage as WorkflowStage, attempt: Number(row.attempt), status: row.status as WorkflowStageStatus, reasonCode: row.status === "retryable_error" ? "model_unavailable" : "validated", policyVersion: "m4-evidence-v1", inputRefs: [id], outputRefs: [], body: JSON.parse(String(row.body)), updatedAt: String(row.updated_at) }));
  }
  getSubmission(id: string): Submission | null {
    const row = this.sql.prepare("SELECT body FROM submission WHERE id=?").get(id);
    return row ? JSON.parse(String(row.body)) : null;
  }
  private putSubmission(s: Submission) { this.sql.prepare("UPDATE submission SET body=?,finished=? WHERE id=?").run(JSON.stringify(s), s.reply ? 1 : 0, s.id); }
  begin(id: string, original: string, correctionMode: boolean): Submission {
    if (!id || id.length > 200 || !original.trim() || original.length > 4000 || typeof correctionMode !== "boolean") throw new StoreError("Invalid submission.");
    return this.transaction(() => {
      const existing = this.getSubmission(id);
      if (existing) {
        if (existing.turn.text !== original || existing.turn.correctionMode !== correctionMode) throw new StoreError("Submission ID already belongs to different input.", 409);
        return existing;
      }
      if (this.sql.prepare("SELECT id FROM submission WHERE finished=0 LIMIT 1").get()) throw new StoreError("Retry the unfinished message before sending another.", 409);
      const turn: ConversationTurn = { id, conversationId: "local-conversation", sequence: this.nextSequence(), role: "learner", contextId: this.contextId, text: original, occurredAt: new Date().toISOString(), suppliedItemIds: [], correctionMode, correction: null };
      const submission: Submission = { id, turn, preferences: this.preferences(), evidenceDone: false, stateRevision: null, reply: null };
      this.insertTurn(turn);
      this.sql.prepare("INSERT INTO submission(id,body) VALUES (?,?)").run(id, JSON.stringify(submission));
      this.upsertStage(id, "captured", "accepted", { turnId: turn.id, preferences: submission.preferences });
      this.upsertStage(id, "snapshot_pinned", "accepted", { stateRevision: this.revision(), profileVersion: submission.preferences.profileVersion });
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
  revision(): string { return String(this.sql.prepare("SELECT COALESCE(MAX(ordinal),0) AS n FROM evidence_event").get()!.n); }
  evidence(revision = this.revision(), itemId?: SenseId): EvidenceEvent[] {
    if (typeof revision !== "string" || !/^\d+$/.test(revision) || !Number.isSafeInteger(Number(revision)) || Number(revision) > Number(this.revision())) throw new StoreError("Invalid state revision.");
    return this.sql.prepare(`SELECT body FROM evidence_event WHERE ordinal<=?${itemId ? " AND item_id=?" : ""} ORDER BY ordinal`).all(...(itemId ? [Number(revision), itemId] : [Number(revision)])).map(r => JSON.parse(String(r.body)));
  }
  private append(events: readonly EvidenceEvent[]) {
    for (const e of events) this.sql.prepare("INSERT OR IGNORE INTO evidence_event(id,item_id,turn_id,body) VALUES (?,?,?,?)").run(e.id, e.itemId, e.turnId, JSON.stringify(e));
    for (const id of new Set(events.map(e => e.itemId))) {
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
  finish(id: string, owner: string, reply: AssistantReply, assistant: ConversationTurn, decisions: readonly Decision[], analysis?: ReplyAnalysis) {
    return this.transaction(() => {
      this.checkOwner(id, owner);
      const s = this.getSubmission(id)!;
      if (s.reply) return s.reply;
      const savedAssistant = { ...assistant, sequence: this.nextSequence() };
      this.insertTurn(savedAssistant);
      this.append(decisions.flatMap(d => d.event ? [d.event] : []));
      if (analysis) this.sql.prepare("INSERT INTO reply_analysis VALUES (?,?,?)").run(assistant.id, analysis.contractVersion, JSON.stringify(analysis));
      this.upsertStage(id, "reply_generated", "accepted", { assistantTurnId: savedAssistant.id });
      this.upsertStage(id, "reply_checked", "accepted", { assistantTurnId: savedAssistant.id });
      this.upsertStage(id, "support_validated", "accepted", { supplied: decisions.filter(d => d.event).length });
      this.upsertStage(id, "published", "accepted", { assistantTurnId: savedAssistant.id });
      s.reply = { ...reply, assistantTurn: savedAssistant }; this.putSubmission(s); return s.reply;
    });
  }
  pending(): Submission | null {
    const row = this.sql.prepare("SELECT body FROM submission WHERE finished=0 LIMIT 1").get();
    return row ? JSON.parse(String(row.body)) : null;
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
}

const local = globalThis as typeof globalThis & { unjotLearnerStore?: LearnerStore };
export function learnerStore(): LearnerStore { return local.unjotLearnerStore ??= new LearnerStore(); }
