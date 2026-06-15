import PageHeader from "../components/PageHeader";
import { Card, EmptyState } from "../components/ui";

export default function ComingSoon({ title }: { title: string }) {
  return (
    <main>
      <PageHeader title={title} />
      <Card>
        <EmptyState>This section is coming in a later phase.</EmptyState>
      </Card>
    </main>
  );
}
