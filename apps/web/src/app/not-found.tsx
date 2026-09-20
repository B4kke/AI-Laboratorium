import { ArrowLeft, FlaskConical } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function IkkeFunnet() {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="glass-panel max-w-md rounded-2xl border border-white/8 p-8 text-center">
        <FlaskConical className="mx-auto mb-4 size-7 text-cyan-200" />
        <p className="font-mono text-xs text-muted-foreground">404</p>
        <h1 className="mt-2 text-xl font-semibold">Dette eksperimentet finnes ikke</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Gå tilbake til laboratoriet og start en ny, reproduserbar kjøring.</p>
        <Button asChild className="mt-6"><Link href="/"><ArrowLeft /> Til laboratoriet</Link></Button>
      </div>
    </main>
  );
}
