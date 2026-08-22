"use client";

import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";

type DecisionMessageProps = {
  actorName: string;
  confidence: number;
  fromA: boolean;
  message: string;
  rationale: string;
  scripted: boolean;
};

export function DecisionMessage({
  actorName,
  confidence,
  fromA,
  message,
  rationale,
  scripted,
}: DecisionMessageProps) {
  return (
    <Message from={fromA ? "assistant" : "user"} className="max-w-[92%]">
      <MessageContent
        className={cn(
          "rounded-xl border px-3.5 py-3",
          fromA
            ? "border-cyan-300/12 bg-cyan-300/[0.055]"
            : "border-violet-300/12 bg-violet-300/[0.055]",
        )}
      >
        <p className="mb-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {actorName} · {scripted ? "SCRIPTED KONTROLL" : `${Math.round(confidence * 100)} % sikker`}
        </p>
        <MessageResponse>{message}</MessageResponse>
        <p className="mt-2 border-t border-white/8 pt-2 text-[10px] leading-4 text-muted-foreground">
          Begrunnelse: {rationale}
        </p>
      </MessageContent>
    </Message>
  );
}
