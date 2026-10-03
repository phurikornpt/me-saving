import { DomainError } from "@/domain/errors";
import type { PersonRepo } from "./ports";

/** Money can only be fronted for, or repaid by, someone the user has set up. */
export async function assertKnownPeople(people: PersonRepo, ids: Iterable<string>): Promise<void> {
  const wanted = new Set(ids);
  if (wanted.size === 0) return;
  const known = new Set((await people.list()).map((p) => p.id));
  for (const id of wanted) if (!known.has(id)) throw new DomainError("UNKNOWN_PERSON", `unknown person ${id}`);
}
