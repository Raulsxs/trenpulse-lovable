import DashboardLayout from "@/components/layout/DashboardLayout";
import ManualStudioEditor from "@/components/studio/ManualStudioEditor";

export default function Studio() {
  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl lg:text-3xl font-heading font-bold text-foreground">
            Criador Manual
          </h1>
          <p className="text-muted-foreground mt-1">
            Monte seu conteúdo slide a slide com preview em tempo real
          </p>
        </div>
        <ManualStudioEditor />
      </div>
    </DashboardLayout>
  );
}
