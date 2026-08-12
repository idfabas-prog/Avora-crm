import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export function RoutePlaceholder({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="page-stack">
      <PageHeader description={description} title={title} />
      <EmptyState
        description="The route is present for V1 navigation and ready for product-specific workflows in the next build phase."
        title={`${title} workspace`}
      />
    </div>
  );
}
