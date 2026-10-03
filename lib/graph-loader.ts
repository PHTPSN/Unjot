import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { GraphManifest } from "../packages/protocol/src/knowledge.ts";
import type { JsonLoader } from "../packages/lexical-core/src/graph.ts";
import { GraphLoadError } from "../packages/lexical-core/src/knowledge.ts";

export const CORPUS_SHA256 = "7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51";
export const CORPUS_COUNTS = { lexicalEntries: 135969, lexemes: 127311, senses: 185129, concepts: 107519, sourceRelations: 244727, frames: 39, nodes: 420050 };

export function createGraphLoader(directory = resolve(process.cwd(), "public/graph-data/oewn-2025")) {
  let manifest: Promise<GraphManifest> | undefined;
  const readManifest = (): Promise<GraphManifest> => {
    manifest ??= readFile(resolve(directory, "manifest.json"), "utf8").then(text => {
      const value = JSON.parse(text) as GraphManifest;
      if (value.version !== "oewn-2025" || value.sha256 !== CORPUS_SHA256 || value.license !== "CC BY 4.0" || !value.attribution ||
        Object.entries(CORPUS_COUNTS).some(([key, count]) => value.counts?.[key as keyof typeof CORPUS_COUNTS] !== count)) throw new GraphLoadError();
      return value;
    }).catch(() => { manifest = undefined; throw new GraphLoadError(); });
    return manifest;
  };
  const load: JsonLoader = async <T>(path: string): Promise<T> => {
    const match = /^graph-data\/oewn-2025\/(node-[0-9a-f]{3}|forms-[0-9a-f]{2})\.json$/.exec(path);
    if (!match) throw new GraphLoadError();
    await readManifest();
    try { return JSON.parse(await readFile(resolve(directory, `${match[1]}.json`), "utf8")) as T; }
    catch { throw new GraphLoadError(); }
  };
  return { load, readManifest };
}
