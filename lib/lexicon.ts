import { LexicalGraph } from "../packages/lexical-core/src/graph.ts";
import { fixtureLoader } from "../packages/golden-tests/fixtures/graph.ts";

export const acceptanceGraph = new LexicalGraph(fixtureLoader);
