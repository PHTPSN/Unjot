/** A single OEWN sense, not a word-form node or a learner-specific record. */
export interface LexicalItem {
  readonly id: `sense:${string}`;
  readonly canonicalForm: string;
  readonly language: "en";
  readonly partOfSpeech: "n" | "v" | "a" | "s" | "r";
  readonly definition: string;
  readonly forms: readonly string[];
  readonly lexemeId: `lex:${string}`;
  readonly conceptId: `concept:${string}`;
  readonly source: "oewn-2025";
}
