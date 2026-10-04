import type { Sequelize } from "sequelize";
import type { CredentialVerifier } from "@/application/ports";
import { hashPassword, isWellFormedHash, verifyPassword } from "../../security/password";
import { seedDefaultWallet, seedUserDefaults } from "../default-categories";
import { initModels } from "../models";

const normalize = (email: string) => email.trim().toLowerCase();

// Checked when the email is unknown, so a wrong email costs the same scrypt work as a wrong password.
let dummyHash: Promise<string> | undefined;
const dummy = () => (dummyHash ??= hashPassword("not-a-real-password"));

/** Accounts live in the `users` table. Returns the account id, or null for a wrong email or password. */
export function createDbCredentialVerifier(sequelize: Sequelize): CredentialVerifier {
  const { User } = initModels(sequelize);
  return {
    async verify(email, password) {
      const user = await User.findOne({ where: { email: normalize(email) } });
      const ok = await verifyPassword(password, user?.passwordHash ?? (await dummy()));
      return user && ok ? user.id : null;
    },
  };
}

/** A new, empty account with the default categories and a "เงินสด" wallet. Refuses an email that is already taken. */
export async function createUser(sequelize: Sequelize, email: string, passwordHash: string): Promise<string> {
  const { User } = initModels(sequelize);
  if (!isWellFormedHash(passwordHash)) throw new Error("password hash is not in the expected scrypt format");
  return sequelize.transaction(async (transaction) => {
    if (await User.findOne({ where: { email: normalize(email) }, transaction })) {
      throw new Error(`an account for ${normalize(email)} already exists`);
    }
    const user = await User.create({ email: normalize(email), passwordHash }, { transaction });
    await seedUserDefaults(sequelize, user.id, transaction);
    await seedDefaultWallet(sequelize, user.id, transaction);
    return user.id;
  });
}
