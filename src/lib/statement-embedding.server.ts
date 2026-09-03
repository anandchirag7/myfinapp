import { createOllamaClient } from "./ollama.server";
import { normalizePattern } from "./statement-normalize";

export type VerifiedEntityMatch = {
  pattern: string;
  entityId: string;
  canonicalName: string;
  categoryKey: string | null;
  categoryId: string | null;
  similarity: number;
  corroborated: boolean;
};

const meaningfulTokens = (value: string) =>
  new Set(
    normalizePattern(value)
      .split(/\s+/)
      .filter((token) => token.length >= 3),
  );

export function hasTokenCorroboration(pattern: string, alias: string): boolean {
  const left = meaningfulTokens(pattern);
  return [...meaningfulTokens(alias)].some((token) => left.has(token));
}

/** Retrieve verified household/global entities. Similarity alone is never authoritative. */
export async function retrieveVerifiedEntities(
  supabase: any,
  householdId: string,
  patterns: string[],
): Promise<Map<string, VerifiedEntityMatch>> {
  const matches = new Map<string, VerifiedEntityMatch>();
  if (!patterns.length || !process.env.OLLAMA_EMBED_MODEL) return matches;

  const embeddings = (await createOllamaClient().embed(patterns)).embeddings ?? [];
  await Promise.all(
    patterns.map(async (pattern, index) => {
      const embedding = embeddings[index];
      if (!embedding) return;
      const { data, error } = await supabase.rpc("match_verified_merchant_aliases", {
        query_embedding: embedding,
        match_household_id: householdId,
        match_count: 3,
      });
      if (error) return;
      const candidate = (data ?? []).find(
        (row: any) =>
          row.relation === "positive" &&
          Number(row.similarity) >= 0.88 &&
          hasTokenCorroboration(pattern, row.alias_text),
      );
      if (!candidate) return;
      matches.set(pattern, {
        pattern,
        entityId: candidate.entity_id,
        canonicalName: candidate.canonical_name,
        categoryKey: candidate.category_key ?? null,
        categoryId: candidate.category_id ?? null,
        similarity: Number(candidate.similarity),
        corroborated: true,
      });
    }),
  );
  return matches;
}
