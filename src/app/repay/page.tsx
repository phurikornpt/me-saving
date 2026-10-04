import { Suspense } from "react";
import { RepayScreen } from "@/components/RepayScreen";
import { PageTransition } from "@/components/PageTransition";

export default function RepayPage() {
  return (
    <PageTransition>
      <Suspense>
        <RepayScreen />
      </Suspense>
    </PageTransition>
  );
}
