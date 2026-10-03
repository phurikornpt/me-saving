import { normalizeLayout } from "@/domain/dashboard-layout";
import type { CategoryRecord, CategoryRepo, PresetRecord, PresetRepo, SettingsRecord, SettingsRepo } from "../ports";

export class ManageSettings {
  constructor(private readonly settings: SettingsRepo) {}
  get() {
    return this.settings.get();
  }
  update(patch: { partnerNote?: string; dashboardLayout?: unknown }): Promise<SettingsRecord> {
    return this.settings.update({
      ...(patch.partnerNote !== undefined && { partnerNote: patch.partnerNote.slice(0, 500) }),
      ...(patch.dashboardLayout !== undefined && { dashboardLayout: normalizeLayout(patch.dashboardLayout) }),
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
