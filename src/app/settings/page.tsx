import { PageTransition } from "@/components/PageTransition";
import { SettingsScreen } from "@/components/SettingsScreen";
import { logout } from "./actions";

export default function SettingsPage() {
  return (
    <PageTransition>
      <SettingsScreen logout={logout} />
    </PageTransition>
  );
}
