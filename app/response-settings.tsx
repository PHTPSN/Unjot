"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ResponsePreferences } from "../packages/protocol/src/comprehension.ts";

export function ResponseSettings({ onSaving }: { onSaving: (saving: boolean) => void }) {
  const [preferences, setPreferences] = useState<ResponsePreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/response-preferences").then(async r => {
      if (!r.ok) throw new Error("Could not load response preferences. Reload to retry.");
      setPreferences(await r.json());
    }).catch(e => setMessage(e.message));
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preferences || saving) return;
    setSaving(true); onSaving(true); setMessage("");
    try {
      const { maxUnfamiliarRatio, maxNewExpressions, allowChineseSupport, startingLevel } = preferences;
      const r = await fetch("/api/response-preferences", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ maxUnfamiliarRatio, maxNewExpressions, allowChineseSupport, startingLevel }) });
      const value = await r.json();
      if (!r.ok) throw new Error(value.error ?? "Could not save preferences.");
      setPreferences(value); setMessage("Saved. Applies to your next message; retries keep their original settings.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save preferences."); }
    finally { setSaving(false); onSaving(false); }
  }
  return <details className="response-settings">
    <summary>Response preferences</summary>
    <p>Choose how much new English to introduce. These settings do not mark expressions as learned. Strict reply limits are coming in the next milestone.</p>
    {preferences && <form onSubmit={save}>
      <fieldset disabled={saving}>
        <label>Unfamiliar English ratio (0–1)<input type="number" min="0" max="1" step="0.01" required value={preferences.maxUnfamiliarRatio} onChange={e => setPreferences({ ...preferences, maxUnfamiliarRatio: e.target.valueAsNumber })} /></label>
        <label>Different new expressions (0–20)<input type="number" min="0" max="20" step="1" required value={preferences.maxNewExpressions} onChange={e => setPreferences({ ...preferences, maxNewExpressions: e.target.valueAsNumber })} /></label>
        <label>Starting level (optional)<select value={preferences.startingLevel ?? ""} onChange={e => setPreferences({ ...preferences, startingLevel: (e.target.value || null) as ResponsePreferences["startingLevel"] })}>
          <option value="">No estimate</option>{["A1", "A2", "B1", "B2", "C1", "C2"].map(level => <option key={level}>{level}</option>)}
        </select></label>
        <label className="setting-checkbox"><input type="checkbox" checked={preferences.allowChineseSupport} onChange={e => setPreferences({ ...preferences, allowChineseSupport: e.target.checked })} /> Allow Chinese support</label>
        <button type="submit">{saving ? "Saving…" : "Save preferences"}</button>
      </fieldset>
    </form>}
    <p role="status">{message}</p>
  </details>;
}
