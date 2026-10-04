import type { LexicalGraph } from "../packages/lexical-core/src/graph.ts";
import { COMPLEXITY_POLICY, type BlockAnalysis, type BudgetResult, type ComprehensionAssessment, type EnglishUnit, type ResponsePlan, type SenseId } from "../packages/protocol/src/comprehension.ts";
import type { PersonalReads } from "./personal-reads.ts";

const WORD = /[A-Za-z]+(?:['’‘-][A-Za-z]+)*/g;
const SENTENCE = /[^.!?。！？\n]+[.!?。！？]?/g;
const CLAUSE_MARKER = /\b(?:and|but|or|because|if|when|while|although|that|which|who|so)\b/gi;

type WordSpan = { start: number; end: number; text: string };
type GraphReads = Pick<LexicalGraph, "findSenseIds">;

/** Segment the unchanged model block. Offsets are UTF-16, as required by the protocol. */
export async function segmentEnglishUnits(text: string, graph: GraphReads): Promise<EnglishUnit[]> {
  if (typeof text !== "string" || text.length > 8000) throw new TypeError("Text exceeds the response segmentation limit.");
  const words: WordSpan[] = [...text.matchAll(WORD)].map(match => ({
    start: match.index!, end: match.index! + match[0].length, text: match[0],
  }));
  const units: EnglishUnit[] = [];
  let index = 0;
  while (index < words.length) {
    let chosen: { end: number; ids: string[]; text: string } | null = null;
    // Longer verified expressions win. A phrase must be contiguous apart from whitespace.
    for (let length = Math.min(6, words.length - index); length >= 2; length -= 1) {
      const last = words[index + length - 1];
      const between = text.slice(words[index].start, last.end);
      if (!/^[A-Za-z]+(?:['’‘-][A-Za-z]+)*(?:\s+[A-Za-z]+(?:['’‘-][A-Za-z]+)*)+$/.test(between)) continue;
      const ids = [...new Set(await graph.findSenseIds(between))].slice(0, 100);
      if (ids.length === 1) { chosen = { end: index + length, ids, text: between }; break; }
    }
    const endIndex = chosen?.end ?? index + 1;
    const span = { start: words[index].start, end: words[endIndex - 1].end };
    const surface = text.slice(span.start, span.end);
    const candidateIds = (chosen?.ids ?? [...new Set(await graph.findSenseIds(surface))].slice(0, 100)) as SenseId[];
    units.push({
      span,
      text: surface,
      candidateIds,
      itemId: candidateIds.length === 1 ? candidateIds[0] as `sense:${string}` : null,
      unresolvedReason: candidateIds.length === 0 ? "missing_coverage" : candidateIds.length > 1 ? "ambiguous_meaning" : null,
    });
    index = endIndex;
  }
  return units;
}
export function complexityForText(text: string, units: readonly EnglishUnit[], distinctLimit = COMPLEXITY_POLICY.maxNewMeaningsPerSentence) {
  const sentenceResults = [...text.matchAll(SENTENCE)].map(match => {
    const start = match.index!;
    const end = start + match[0].length;
    const sentenceText = match[0];
    const wordCount = [...sentenceText.matchAll(WORD)].length;
    const clauses = 1 + [...sentenceText.matchAll(CLAUSE_MARKER)].length;
    const keys = new Set(units.filter(unit => unit.span.start >= start && unit.span.end <= end).map(unit =>
      unit.itemId ? unit.itemId : `unresolved:${unit.text.toLocaleLowerCase()}`));
    return { wordCount, clauses, distinctMeanings: keys.size };
  });
  const passed = sentenceResults.every(sentence => sentence.wordCount <= COMPLEXITY_POLICY.maxWordsPerSentence &&
    sentence.clauses <= COMPLEXITY_POLICY.maxClausesPerSentence && sentence.distinctMeanings <= distinctLimit);
  return { passed, sentenceResults };
}

export function budgetFor(units: readonly EnglishUnit[], assessments: readonly ComprehensionAssessment[], complexityPassed: boolean, unfamiliarTargetIds: readonly string[] = [], ratioCap = 0.05): BudgetResult {
  const unfamiliar: string[] = [];
  const unresolved: string[] = [];
  let provisionalOccurrences = 0;
  units.forEach((unit, index) => {
    const assessment = assessments[index];
    if (assessment?.assessment === "provisional") { provisionalOccurrences += 1; return; }
    if (assessment?.assessment === "supported") return;
    const key = unit.itemId ? unit.itemId : `unresolved:${unit.text.trim().toLocaleLowerCase()}`;
    unfamiliar.push(key);
    if (!unit.itemId || assessment?.assessment === "unresolved") unresolved.push(key);
  });
  const distinct = [...new Set(unfamiliar)];
  const ratio = units.length === 0 ? 0 : unfamiliar.length / units.length;
  const targetBoundPassed = unfamiliarTargetIds.length <= 2;
  return {
    englishOccurrences: units.length,
    unfamiliarOccurrences: unfamiliar.length,
    unfamiliarRatio: ratio,
    distinctUnfamiliarKeys: distinct,
    provisionalOccurrences,
    ratioPassed: ratio <= ratioCap,
    distinctPassed: targetBoundPassed && distinct.length <= 2,
    complexityPassed,
    passed: ratio <= ratioCap && targetBoundPassed && distinct.length <= 2 && complexityPassed,
    unresolvedOccurrences: unresolved.length,
    unresolvedKeys: [...new Set(unresolved)],
  };
}

export async function analyzeBlock(options: {
  id: string; kind: BlockAnalysis["kind"]; text: string; context: string; graph: GraphReads; personal: PersonalReads;
  stateRevision: string; unfamiliarTargetIds?: readonly string[]; ratioCap?: number;
}): Promise<BlockAnalysis> {
  const units = await segmentEnglishUnits(options.text, options.graph);
  const assessments = await options.personal.assess_comprehension({
    text: options.text, context: options.context.slice(0, 2000), units, modality: "reading",
    stateRevision: options.stateRevision, profileVersion: options.personal.preferences.profileVersion, policyVersion: "reading-v1",
  });
  const complexity = complexityForText(options.text, units);
  return {
    id: options.id, kind: options.kind, text: options.text, units, assessments,
    budget: budgetFor(units, assessments, complexity.passed, options.unfamiliarTargetIds, options.ratioCap),
  };
}

export function languageDecision(text: string): "english" | "mixed" | "chinese" {
  const english = WORD.test(text);
  WORD.lastIndex = 0;
  const chinese = /[\u3400-\u9fff]/u.test(text);
  return english && chinese ? "mixed" : english ? "english" : chinese ? "chinese" : "english";
}

export function combinedBudget(blocks: readonly BlockAnalysis[], ratioCap: number, unfamiliarTargetIds: readonly string[] = []): BudgetResult {
  const units = blocks.flatMap(block => block.units);
  const assessments = blocks.flatMap(block => block.assessments);
  const complexityPassed = blocks.every(block => block.budget.complexityPassed);
  const result = budgetFor(units, assessments, complexityPassed, unfamiliarTargetIds);
  return { ...result, ratioPassed: result.unfamiliarRatio <= ratioCap,
    passed: result.unfamiliarRatio <= ratioCap && result.distinctPassed && result.complexityPassed };
}
