import { Suspense } from "react";
import { RepayScreen } from "@/components/RepayScreen";

export default function RepayPage() {
  return (
    <Suspense>
      <RepayScreen />
    </Suspense>
  );
}
