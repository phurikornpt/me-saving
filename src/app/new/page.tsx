import { Suspense } from "react";
import { NewEntryScreen } from "@/components/NewEntryScreen";
import { PageTransition } from "@/components/PageTransition";

export default function NewEntryPage() {
  return (
    <PageTransition>
      <Suspense>
        <NewEntryScreen />
      </Suspense>
    </PageTransition>
  );
}
