import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Compass } from "lucide-react";

/**
 * Página de rota inexistente.
 *
 * Antes era um beco sem saída em inglês ("Oops! Page not found" + um link pra home). Quem caía aqui
 * pelo botão "voltar" — situação real: URL antiga guardada no histórico do navegador — perdia o
 * contexto inteiro e tinha que se reorientar sozinho.
 *
 * Agora mostra QUAL caminho falhou (o usuário consegue reportar, e eu consigo diagnosticar) e
 * oferece as saídas óbvias. Rotas legadas conhecidas já são redirecionadas no App.tsx e nem chegam
 * aqui; esta tela é a rede pras que ainda não mapeamos.
 */
const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404: rota inexistente:", location.pathname);
  }, [location.pathname]);

  const atalhos = [
    { to: "/agent", label: "Assistente" },
    { to: "/contents", label: "Meus conteúdos" },
    { to: "/calendar", label: "Calendário" },
    { to: "/brands", label: "Marcas" },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full bg-muted">
          <Compass className="h-6 w-6 text-muted-foreground" />
        </div>

        <h1 className="mb-2 font-heading text-2xl font-bold text-foreground">
          Essa página não existe
        </h1>
        <p className="mb-1 text-sm text-muted-foreground">
          O endereço abaixo não corresponde a nenhuma tela do TrendPulse.
        </p>
        <code className="mb-6 inline-block max-w-full truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          {location.pathname}
        </code>

        <div className="mb-6 flex justify-center">
          <Button variant="outline" className="gap-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {atalhos.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {a.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NotFound;
