import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Building2, Instagram } from "lucide-react";

interface ProfilePersonalInfoProps {
  fullName: string;
  companyName: string;
  instagramHandle: string;
  onChange: (field: string, value: string) => void;
}

const ProfilePersonalInfo = ({ fullName, companyName, instagramHandle, onChange }: ProfilePersonalInfoProps) => (
  <Card className="shadow-card border-border/50">
    <CardHeader>
      <CardTitle className="text-lg flex items-center gap-2">
        <User className="w-5 h-5 text-primary" />
        Informações Pessoais
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="full_name">Nome Completo</Label>
          <Input id="full_name" value={fullName} onChange={(e) => onChange("full_name", e.target.value)} placeholder="Seu nome completo" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="company_name">
            <Building2 className="w-4 h-4 inline mr-1" />
            Empresa / Instituição
          </Label>
          <Input id="company_name" value={companyName} onChange={(e) => onChange("company_name", e.target.value)} placeholder="Nome da empresa" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="instagram_handle">
          <Instagram className="w-4 h-4 inline mr-1" />
          Handle do Instagram
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
          <Input
            id="instagram_handle"
            value={instagramHandle}
            onChange={(e) => onChange("instagram_handle", e.target.value.replace("@", ""))}
            placeholder="seu_usuario"
            className="pl-8"
          />
        </div>
      </div>
    </CardContent>
  </Card>
);

export default ProfilePersonalInfo;
