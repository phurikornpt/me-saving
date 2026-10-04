import { GroupEntryScreen } from "@/components/GroupEntryScreen";

export default async function EntryPage({ params }: PageProps<"/entries/[id]">) {
  return <GroupEntryScreen id={(await params).id} />;
}
