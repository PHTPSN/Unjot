export function normalizeForm(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function shardKey(value: string, bits: 8 | 12): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return (hash >>> 0 & ((1 << bits) - 1)).toString(16).padStart(bits / 4, "0");
}

export function formShard(value: string): string {
  return shardKey(normalizeForm(value).slice(0, 2), 8);
}

export function nodeShard(value: string): string {
  return shardKey(value, 12);
}
