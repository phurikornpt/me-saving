import { SettingsScreen } from "@/components/SettingsScreen";
import { logout } from "./actions";

export default function SettingsPage() {
  return <SettingsScreen logout={logout} />;
}
