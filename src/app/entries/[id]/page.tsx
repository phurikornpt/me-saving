import { GroupEntryScreen } from "@/components/GroupEntryScreen";
import { PageTransition } from "@/components/PageTransition";

export default async function EntryPage({ params }: PageProps<"/entries/[id]">) {
  return (
    <PageTransition>
      <GroupEntryScreen id={(await params).id} />
    </PageTransition>
  );
}
