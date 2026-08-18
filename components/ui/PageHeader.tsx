import { APP_DISPLAY_NAME } from "@/lib/config/branding";

type PageHeaderProps = {
  title: string;
  description: string;
  action?: React.ReactNode;
};

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <p className="eyebrow">{APP_DISPLAY_NAME}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
