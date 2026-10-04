import { normalizeLayout } from "@/domain/dashboard-layout";
import { DomainError } from "@/domain/errors";
import type {
  CategoryRecord,
  CategoryRepo,
  PersonRecord,
  PersonRepo,
  PresetRecord,
  PresetRepo,
  SettingsRecord,
  SettingsRepo,
} from "../ports";

export class ManageSettings {
  constructor(private readonly settings: SettingsRepo) {}
  get() {
    return this.settings.get();
  }
  update(patch: { dashboardLayout?: unknown; meNote?: string }): Promise<SettingsRecord> {
    return this.settings.update({
      ...(patch.dashboardLayout !== undefined && { dashboardLayout: normalizeLayout(patch.dashboardLayout) }),
      ...(patch.meNote !== undefined && { meNote: patch.meNote }),
    });
  }
}

export class ManageCategories {
  constructor(private readonly categories: CategoryRepo) {}
  list() {
    return this.categories.list();
  }
  create(c: Omit<CategoryRecord, "id" | "archived">) {
    return this.categories.create(c);
  }
  update(id: string, patch: Partial<Omit<CategoryRecord, "id" | "kind">>) {
    return this.categories.update(id, patch);
  }
  /** Categories are archived, never deleted, so old entries keep their label. */
  archive(id: string) {
    return this.categories.update(id, { archived: true });
  }
}

export class ManagePresets {
  constructor(private readonly presets: PresetRepo) {}
  list() {
    return this.presets.list();
  }
  create(p: Omit<PresetRecord, "id">) {
    return this.presets.create(p);
  }
  update(id: string, patch: Partial<Omit<PresetRecord, "id">>) {
    return this.presets.update(id, patch);
  }
  remove(id: string) {
    return this.presets.remove(id);
  }
}

/** The people we front money for. Hidden (archived), never deleted: old entries keep their name. */
export class ManagePeople {
  constructor(private readonly people: PersonRepo) {}
  list() {
    return this.people.list();
  }
  async create(p: { name: string; note?: string }): Promise<PersonRecord> {
    const name = p.name.trim();
    if (!name) throw new DomainError("INVALID_SPLIT", "a person needs a name");
    const all = await this.people.list();
    return this.people.create({ name, note: (p.note ?? "").slice(0, 500), sort: Math.max(-1, ...all.map((x) => x.sort)) + 1 });
  }
  async update(id: string, patch: Partial<Omit<PersonRecord, "id">>): Promise<PersonRecord> {
    const name = patch.name?.trim();
    if (name === "") throw new DomainError("INVALID_SPLIT", "a person needs a name");
    const out = await this.people.update(id, {
      ...patch,
      ...(name !== undefined && { name }),
      ...(patch.note !== undefined && { note: patch.note.slice(0, 500) }),
    });
    if (!out) throw new DomainError("NOT_FOUND", "person not found");
    return out;
  }
}
