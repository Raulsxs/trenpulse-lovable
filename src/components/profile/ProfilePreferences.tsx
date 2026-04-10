import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Rss, X } from "lucide-react";
import { useState } from "react";

interface ProfilePreferencesProps {
  secondaryLanguages: string[];
  rssSources: string[];
  onChange: (field: string, value: any) => void;
}

const ProfilePreferences = ({
  secondaryLanguages,
  rssSources,
  onChange,
}: ProfilePreferencesProps) => {
  const [newRss, setNewRss] = useState("");

  const addRss = () => {
    let url = newRss.trim().toLowerCase();
    if (!url) return;
    // Accept bare domains like "exame.com" — normalize to domain format
    url = url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (!/^[a-z0-9]([a-z0-9-]*\.)+[a-z]{2,}/.test(url)) return;
    if (!rssSources.includes(url)) {
      onChange("rss_sources", [...rssSources, url]);
      setNewRss("");
    }
  };

  const removeRss = (url: string) => {
    onChange("rss_sources", rssSources.filter(u => u !== url));
  };

  return (
    <>
      {/* Bilingual captions */}
      <Card className="shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            Legendas Bilíngues
          </CardTitle>
          <CardDescription>As legendas dos posts serão geradas no idioma selecionado além do português</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Idioma secundário</Label>
            <Select
              value={secondaryLanguages[0] || "none"}
              onValueChange={(v) => onChange("secondary_languages", v === "none" ? [] : [v])}
            >
              <SelectTrigger><SelectValue placeholder="Somente português" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Somente português</SelectItem>
                <SelectItem value="en">+ Inglês (bilíngue)</SelectItem>
                <SelectItem value="es">+ Espanhol (bilíngue)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Content sources */}
      <Card className="shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Rss className="w-5 h-5 text-primary" />
            Fontes de Conteúdo
          </CardTitle>
          <CardDescription>Sites que o TrendPulse monitora para buscar tendências e sugestões do seu nicho</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Fontes padrão (sempre ativas):</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">Exame</Badge>
              <Badge variant="outline" className="text-xs">G1</Badge>
              <Badge variant="outline" className="text-xs">InfoMoney</Badge>
            </div>
          </div>
          {rssSources.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Suas fontes personalizadas:</p>
              <div className="flex flex-wrap gap-2">
                {rssSources.map(src => (
                  <Badge key={src} variant="secondary" className="gap-1 pr-1">
                    {src}
                    <button onClick={() => removeRss(src)} className="ml-1 hover:text-destructive"><X className="w-3 h-3" /></button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={newRss}
              onChange={(e) => setNewRss(e.target.value)}
              placeholder="Ex: exame.com, g1.globo.com, meusite.com.br..."
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRss())}
              className="flex-1"
            />
            <button type="button" onClick={addRss} className="px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
              Adicionar
            </button>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default ProfilePreferences;
