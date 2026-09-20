"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function GlobalFeil({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="glass-panel max-w-md rounded-2xl border border-white/8 p-8 text-center">
        <AlertTriangle className="mx-auto mb-4 size-7 text-amber-200" />
        <h1 className="text-xl font-semibold">Laboratoriet traff en uventet feil</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Forsøket er ikke slettet. Prøv å laste denne visningen på nytt.</p>
        <Button className="mt-6" onClick={reset}><RotateCcw /> Prøv igjen</Button>
      </div>
    </main>
  );
}
