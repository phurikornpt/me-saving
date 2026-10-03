import { auth } from "@/lib/auth";
import { container } from "@/lib/container";

export const runtime = "nodejs";

// Warms the function and the DB connection. Called (throttled) when the app opens,
// regains focus, or the user touches [+].
export async function GET() {
  if (!(await auth())) return new Response(null, { status: 401 });
  await container().sequelize.query("SELECT 1");
  return new Response(null, { status: 204 });
}
