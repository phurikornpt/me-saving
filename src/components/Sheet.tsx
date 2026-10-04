"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { Fragment, type ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * Bottom sheet (Radix Dialog handles focus trap, Esc and scroll lock; motion handles the slide).
 * Drag the grabber or title down to close. Dragging is limited to that header so the body can still scroll.
 * Text is not selectable (a drag or long press would pop the copy menu instead of scrolling); fields still are.
 * The body scroller is a layoutScroll root inside a layoutRoot sheet, so rows that animate their layout
 * (the calendar's day list) measure correctly while scrolled instead of jumping.
 */
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
  const controls = useDragControls();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open && (
            <Fragment key="sheet">
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  className="fixed inset-0 z-40 bg-black/40"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  className="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] max-w-md select-none flex-col rounded-t-[32px] bg-card px-5 pt-3 shadow-xl outline-none will-change-transform [-webkit-touch-callout:none] [&_input]:select-text [&_textarea]:select-text"
                  layoutRoot
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%", transition: { duration: 0.22, ease: "easeIn" } }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  drag="y"
                  dragControls={controls}
                  dragListener={false}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.5 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.y > 100 || info.velocity.y > 600) onOpenChange(false);
                  }}
                >
                  <div className="touch-none" onPointerDown={(e) => controls.start(e)}>
                    <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line" />
                    <div className="mb-3 flex items-center justify-between">
                      <Dialog.Title className="font-display text-xl">{title}</Dialog.Title>
                      <Dialog.Close
                        className="rounded-full p-2 text-ink-2"
                        aria-label="ปิด"
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <Icon name="close" />
                      </Dialog.Close>
                    </div>
                  </div>
                  <motion.div layoutScroll className="touch-pan-y overflow-y-auto overscroll-contain pb-2">{children}</motion.div>
                </motion.div>
              </Dialog.Content>
            </Fragment>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
