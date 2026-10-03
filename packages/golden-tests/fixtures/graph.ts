import { formShard, nodeShard, normalizeForm, type GraphNode, type JsonLoader } from "../../lexical-core/src/graph.ts";

const nodes: Record<string, GraphNode> = {
  "lex:figure out": {
    id: "lex:figure out",
    label: "figure out",
    kind: "lexeme",
    definition: "A word or expression.",
    children: ["sense:figure_out%2:31:00::"],
    relations: [],
  },
  "lex:figure": {
    id: "lex:figure",
    label: "figure",
    kind: "lexeme",
    definition: "A word or expression.",
    children: ["sense:figure%2:31:00::"],
    relations: [],
  },
  "sense:figure_out%2:31:00::": {
    id: "sense:figure_out%2:31:00::",
    label: "figure out",
    kind: "sense",
    definition: "find the solution to (a problem or question) or understand the meaning of",
    children: [],
    relations: [
      { target: "lex:figure out", type: "word_form" },
      { target: "frame:vtai", type: "uses_pattern" },
      { target: "sense:figure%2:31:00::", type: "also", incoming: true },
      { target: "sense:figure%2:31:00::", type: "also" },
    ],
    parent: "concept:00636568-v",
    pos: "v",
    domain: "verb.cognition",
    lexeme: "lex:figure out",
    concept: "concept:00636568-v",
    examples: ["did you figure it out?"],
  },
  "concept:00636568-v": {
    id: "concept:00636568-v",
    label: "solve",
    kind: "concept",
    definition: "find the solution to (a problem or question) or understand the meaning of",
    children: ["sense:figure_out%2:31:00::"],
    relations: [],
    parent: "domain:verb.cognition",
    domain: "verb.cognition",
    pos: "v",
  },
  "frame:vtai": {
    id: "frame:vtai",
    label: "Somebody ----s something",
    kind: "frame",
    definition: "A syntactic frame from Open English WordNet.",
    children: ["sense:figure_out%2:31:00::"],
    relations: [],
    parent: "patterns",
  },
  "sense:figure%2:31:00::": {
    id: "sense:figure%2:31:00::",
    label: "figure",
    kind: "sense",
    definition: "make a mathematical calculation or computation",
    children: [],
    relations: [
      { target: "sense:figure_out%2:31:00::", type: "also", incoming: true },
    ],
    parent: "concept:00638921-v",
    pos: "v",
    domain: "verb.cognition",
    lexeme: "lex:figure",
    concept: "concept:00638921-v",
  },
};

const forms: Record<string, string[]> = {
  "figure out": ["lex:figure out"],
  "figure": ["lex:figure"],
};

export const fixtureLoader: JsonLoader = async <T>(path: string): Promise<T> => {
  const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.json$/, "");
  if (name.startsWith("forms-")) {
    return Object.fromEntries(Object.entries(forms).filter(([form]) => {
      return `forms-${formShard(normalizeForm(form))}` === name;
    })) as T;
  }
  if (name.startsWith("node-")) {
    return Object.fromEntries(Object.entries(nodes).filter(([id]) => `node-${nodeShard(id)}` === name)) as T;
  }
  throw new Error(`Unexpected fixture path: ${path}`);
};
