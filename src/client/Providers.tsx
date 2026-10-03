"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AUTH_EXPIRED_EVENT } from "./api";
import { TopProgress } from "@/components/Loading";
import { wake } from "./wake";

const DAY = 24 * 60 * 60 * 1000;

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, gcTime: DAY, retry: 1, refetchOnWindowFocus: true } } }),
  );

  // Cached data survives reloads, so opening the app shows the last numbers instantly while a refetch runs.
  // Restored AFTER hydration on purpose: restoring earlier makes the first client render differ from the
  // server HTML (hydration mismatch).
  useEffect(() => {
    const persister = createSyncStoragePersister({ storage: window.localStorage, key: "me-budget-cache" });
    const [unsubscribe] = persistQueryClient({ queryClient: client, persister, maxAge: DAY, buster: "v1" });
    return unsubscribe;
  }, [client]);

  const router = useRouter();
  useEffect(() => {
    const onExpired = () => router.replace("/login");
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [router]);

  useEffect(() => {
    wake();
    const onVisible = () => document.visibilityState === "visible" && wake();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return (
    <QueryClientProvider client={client}>
      <TopProgress />
      {children}
    </QueryClientProvider>
  );
}
