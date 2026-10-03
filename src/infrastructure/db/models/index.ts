import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";
import type { LayoutItem } from "@/domain/dashboard-layout";

// Schema of record for queries. The tables themselves are created by the SQL migrations,
// so these definitions deliberately mirror them (column names via `underscored`).
// Money columns are integer satang. Never call sync().

export class Category extends Model<InferAttributes<Category>, InferCreationAttributes<Category>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare icon: string; // Material Symbols name
  declare kind: "expense" | "income";
  declare sort: CreationOptional<number>;
  declare archived: CreationOptional<boolean>;
}

export class Person extends Model<InferAttributes<Person>, InferCreationAttributes<Person>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare note: CreationOptional<string>;
  declare sort: CreationOptional<number>;
  declare archived: CreationOptional<boolean>;
}

export class Entry extends Model<InferAttributes<Entry>, InferCreationAttributes<Entry>> {
  declare id: CreationOptional<string>;
  declare kind: "expense" | "income" | "repayment";
  declare occurredAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare total: number;
  /** Sum of this entry's shares (denormalised for the read paths). */
  declare othersShare: CreationOptional<number>;
  declare personId: ForeignKey<Person["id"]> | null;
  declare categoryId: ForeignKey<Category["id"]> | null;
  declare note: string | null;
  declare merchant: string | null;
  declare source: CreationOptional<"manual" | "preset" | "receipt" | "itemized" | "wheel">;
  declare shares?: EntryShare[];
}

export class EntryShare extends Model<InferAttributes<EntryShare>, InferCreationAttributes<EntryShare>> {
  declare entryId: ForeignKey<Entry["id"]>;
  declare personId: ForeignKey<Person["id"]>;
  declare amount: number;
}

export class ReceiptLine extends Model<
  InferAttributes<ReceiptLine>,
  InferCreationAttributes<ReceiptLine>
> {
  declare id: CreationOptional<string>;
  declare entryId: ForeignKey<Entry["id"]>;
  declare position: CreationOptional<number>;
  declare rawName: string;
  declare canonicalName: string;
  declare qty: CreationOptional<number>;
  declare price: number;
  declare includesMe: boolean;
  declare people: string[];
  declare categoryId: ForeignKey<Category["id"]> | null;
  declare lowConfidence: CreationOptional<boolean>;
}

export class OwnerMemory extends Model<
  InferAttributes<OwnerMemory>,
  InferCreationAttributes<OwnerMemory>
> {
  declare canonicalName: string;
  declare includesMe: boolean;
  declare people: string[];
  declare updatedAt: CreationOptional<Date>;
}

export class Preset extends Model<InferAttributes<Preset>, InferCreationAttributes<Preset>> {
  declare id: CreationOptional<string>;
  declare label: string;
  declare icon: string;
  declare amount: number;
  declare categoryId: ForeignKey<Category["id"]> | null;
  declare personId: ForeignKey<Person["id"]> | null;
  declare splitKind: "equal" | "theirs" | null;
  declare sort: CreationOptional<number>;
}

export class LoggedDay extends Model<InferAttributes<LoggedDay>, InferCreationAttributes<LoggedDay>> {
  declare day: string; // 'YYYY-MM-DD' (Asia/Bangkok day of the press)
  declare kind: "entry" | "no_spend";
  declare firstLoggedAt: CreationOptional<Date>;
}

export class XpEvent extends Model<InferAttributes<XpEvent>, InferCreationAttributes<XpEvent>> {
  declare id: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
  declare reason: string;
  declare amount: number;
}

export class Setting extends Model<InferAttributes<Setting>, InferCreationAttributes<Setting>> {
  declare id: CreationOptional<number>;
  declare dashboardLayout: CreationOptional<LayoutItem[]>;
}

export class LoginAttempt extends Model<
  InferAttributes<LoginAttempt>,
  InferCreationAttributes<LoginAttempt>
> {
  declare id: CreationOptional<string>; // bigserial arrives as string
  declare key: string;
  declare attemptedAt: CreationOptional<Date>;
}

export interface Models {
  Category: typeof Category;
  Person: typeof Person;
  Entry: typeof Entry;
  EntryShare: typeof EntryShare;
  ReceiptLine: typeof ReceiptLine;
  OwnerMemory: typeof OwnerMemory;
  Preset: typeof Preset;
  LoggedDay: typeof LoggedDay;
  XpEvent: typeof XpEvent;
  Setting: typeof Setting;
  LoginAttempt: typeof LoginAttempt;
}

const initialised = new WeakSet<Sequelize>();

/** Idempotent per Sequelize instance (serverless hot paths call this repeatedly). */
export function initModels(sequelize: Sequelize): Models {
  if (!initialised.has(sequelize)) {
    const uuid = { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true };
    // modelName MUST be explicit: Sequelize otherwise uses the class name, which the production minifier
    // mangles. The association accessors (setEntry, getEntry...) are built from that name, and a mangled
    // one makes them overwrite Model#set and recurse until the process dies with "Maximum call stack".
    const opts = (modelName: string, tableName: string) => ({
      sequelize,
      modelName,
      tableName,
      timestamps: false,
      underscored: true,
    });

    Category.init(
      {
        id: uuid,
        name: { type: DataTypes.TEXT, allowNull: false },
        icon: { type: DataTypes.TEXT, allowNull: false },
        kind: { type: DataTypes.TEXT, allowNull: false },
        sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        archived: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      },
      opts("Category", "categories"),
    );
    Person.init(
      {
        id: uuid,
        name: { type: DataTypes.TEXT, allowNull: false },
        note: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
        sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        archived: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      },
      opts("Person", "people"),
    );
    Entry.init(
      {
        id: uuid,
        kind: { type: DataTypes.TEXT, allowNull: false },
        occurredAt: { type: DataTypes.DATE, allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        total: { type: DataTypes.INTEGER, allowNull: false },
        othersShare: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        personId: { type: DataTypes.UUID, allowNull: true },
        categoryId: { type: DataTypes.UUID, allowNull: true },
        note: { type: DataTypes.TEXT, allowNull: true },
        merchant: { type: DataTypes.TEXT, allowNull: true },
        source: { type: DataTypes.TEXT, allowNull: false, defaultValue: "manual" },
      },
      opts("Entry", "entries"),
    );
    EntryShare.init(
      {
        entryId: { type: DataTypes.UUID, primaryKey: true },
        personId: { type: DataTypes.UUID, primaryKey: true },
        amount: { type: DataTypes.INTEGER, allowNull: false },
      },
      opts("EntryShare", "entry_shares"),
    );
    ReceiptLine.init(
      {
        id: uuid,
        entryId: { type: DataTypes.UUID, allowNull: false },
        position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        rawName: { type: DataTypes.TEXT, allowNull: false },
        canonicalName: { type: DataTypes.TEXT, allowNull: false },
        qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
        price: { type: DataTypes.INTEGER, allowNull: false },
        includesMe: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        people: { type: DataTypes.ARRAY(DataTypes.UUID), allowNull: false, defaultValue: [] },
        categoryId: { type: DataTypes.UUID, allowNull: true },
        lowConfidence: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      },
      opts("ReceiptLine", "receipt_lines"),
    );
    OwnerMemory.init(
      {
        canonicalName: { type: DataTypes.TEXT, primaryKey: true },
        includesMe: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        people: { type: DataTypes.ARRAY(DataTypes.UUID), allowNull: false, defaultValue: [] },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      },
      opts("OwnerMemory", "owner_memory"),
    );
    Preset.init(
      {
        id: uuid,
        label: { type: DataTypes.TEXT, allowNull: false },
        icon: { type: DataTypes.TEXT, allowNull: false },
        amount: { type: DataTypes.INTEGER, allowNull: false },
        categoryId: { type: DataTypes.UUID, allowNull: true },
        personId: { type: DataTypes.UUID, allowNull: true },
        splitKind: { type: DataTypes.TEXT, allowNull: true },
        sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      },
      opts("Preset", "presets"),
    );
    LoggedDay.init(
      {
        day: { type: DataTypes.DATEONLY, primaryKey: true },
        kind: { type: DataTypes.TEXT, allowNull: false },
        firstLoggedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      },
      opts("LoggedDay", "logged_days"),
    );
    XpEvent.init(
      {
        id: uuid,
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        reason: { type: DataTypes.TEXT, allowNull: false },
        amount: { type: DataTypes.INTEGER, allowNull: false },
      },
      opts("XpEvent", "xp_events"),
    );
    Setting.init(
      {
        id: { type: DataTypes.SMALLINT, primaryKey: true, defaultValue: 1 },
        dashboardLayout: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      },
      opts("Setting", "settings"),
    );
    LoginAttempt.init(
      {
        id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
        key: { type: DataTypes.TEXT, allowNull: false },
        attemptedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      },
      opts("LoginAttempt", "login_attempts"),
    );

    Entry.hasMany(EntryShare, { foreignKey: "entryId", as: "shares", onDelete: "CASCADE" });
    EntryShare.belongsTo(Entry, { foreignKey: "entryId" });
    Person.hasMany(EntryShare, { foreignKey: "personId" });
    EntryShare.belongsTo(Person, { foreignKey: "personId" });
    Entry.hasMany(ReceiptLine, { foreignKey: "entryId", as: "lines", onDelete: "CASCADE" });
    ReceiptLine.belongsTo(Entry, { foreignKey: "entryId" });
    Category.hasMany(Entry, { foreignKey: "categoryId" });
    Entry.belongsTo(Category, { foreignKey: "categoryId" });
    Category.hasMany(ReceiptLine, { foreignKey: "categoryId" });
    ReceiptLine.belongsTo(Category, { foreignKey: "categoryId" });
    Category.hasMany(Preset, { foreignKey: "categoryId" });
    Preset.belongsTo(Category, { foreignKey: "categoryId" });

    initialised.add(sequelize);
  }
  return { Category, Person, Entry, EntryShare, ReceiptLine, OwnerMemory, Preset, LoggedDay, XpEvent, Setting, LoginAttempt };
}
