"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

/** Bottom sheet (Radix Dialog handles focus trap, Esc and scroll lock). */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] max-w-md flex-col rounded-t-[32px] bg-card px-5 pt-3 shadow-xl outline-none"
        >
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line" />
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="font-display text-xl">{title}</Dialog.Title>
            <Dialog.Close className="rounded-full p-2 text-ink-2" aria-label="ปิด">
              <Icon name="close" />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto pb-2">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
