const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Política de Privacidade</h1>
      <p className="text-muted-foreground mb-4">Última atualização: 16 de março de 2026</p>

      <section className="space-y-6 text-sm leading-relaxed text-foreground/90">
        <div>
          <h2 className="text-lg font-semibold mb-2">1. Informações que Coletamos</h2>
          <p>Coletamos informações que você nos fornece diretamente, como nome, endereço de e-mail, dados de perfil e conteúdo gerado na plataforma. Também coletamos dados de uso automaticamente, incluindo endereço IP, tipo de navegador e páginas visitadas.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">2. Como Usamos Suas Informações</h2>
          <p>Utilizamos suas informações para fornecer, manter e melhorar nossos serviços, personalizar sua experiência, enviar comunicações relevantes e garantir a segurança da plataforma.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">3. Compartilhamento de Dados</h2>
          <p>Não vendemos suas informações pessoais. Podemos compartilhar dados com prestadores de serviços terceirizados que nos auxiliam na operação da plataforma, sempre sob obrigações de confidencialidade.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">4. Armazenamento e Segurança</h2>
          <p>Seus dados são armazenados em servidores seguros com criptografia. Implementamos medidas técnicas e organizacionais para proteger suas informações contra acesso não autorizado, alteração ou destruição.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">5. Seus Direitos (LGPD)</h2>
          <p>De acordo com a Lei Geral de Proteção de Dados (LGPD), você tem direito a acessar, corrigir, excluir seus dados pessoais, solicitar a portabilidade e revogar o consentimento a qualquer momento.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">6. Cookies</h2>
          <p>Utilizamos cookies e tecnologias semelhantes para melhorar a experiência do usuário, analisar o tráfego e personalizar conteúdo. Você pode gerenciar suas preferências de cookies nas configurações do navegador.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">7. Retenção de Dados</h2>
          <p>Mantemos suas informações pessoais pelo tempo necessário para cumprir os fins para os quais foram coletadas, ou conforme exigido por lei.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">8. Alterações nesta Política</h2>
          <p>Podemos atualizar esta política periodicamente. Notificaremos sobre mudanças significativas por e-mail ou aviso na plataforma.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">9. Contato</h2>
          <p>Para dúvidas sobre esta política ou sobre seus dados pessoais, entre em contato conosco através do e-mail disponível na plataforma.</p>
        </div>
      </section>
    </div>
  );
};

export default PrivacyPolicy;
