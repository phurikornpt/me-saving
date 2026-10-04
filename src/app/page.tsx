import { Dashboard } from "@/components/Dashboard";
import { PageTransition } from "@/components/PageTransition";

export default function Home() {
  return (
    <PageTransition>
      <Dashboard />
    </PageTransition>
  );
}
