import { Suspense } from "react";
import { NewEntryScreen } from "@/components/NewEntryScreen";

export default function NewEntryPage() {
  return (
    <Suspense>
      <NewEntryScreen />
    </Suspense>
  );
}
