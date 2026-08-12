export function EmptyState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="empty-state">
      <div aria-hidden="true" />
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}
