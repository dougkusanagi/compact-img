import { ArrowDownRight, Layers3, LockKeyhole, Sparkles } from "lucide-react";

export function WorkspaceIntro() {
  return (
    <div className="workspace-intro animate-enter">
      <div className="workspace-intro-copy">
        <span className="workspace-eyebrow"><Sparkles className="h-3.5 w-3.5" /> SEU ESTÚDIO DE IMAGENS</span>
        <h2>Imagens mais leves.<br /><span>Seu fluxo mais rápido.</span></h2>
        <p>Adicione suas imagens, ajuste a saída e compare o resultado em um só lugar.</p>
      </div>
      <div className="workspace-intro-aside" aria-label="Características do processamento">
        <span><Layers3 className="h-4 w-4" /> Várias imagens de uma vez</span>
        <span><LockKeyhole className="h-4 w-4" /> Tudo acontece no seu dispositivo</span>
        <ArrowDownRight className="workspace-intro-arrow h-5 w-5" aria-hidden="true" />
      </div>
    </div>
  );
}
