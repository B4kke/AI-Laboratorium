import { builtInArenas } from "@ai-lab/arena";

import { Playground } from "@/components/laboratory/playground";

export default function Forside() {
  return <Playground initialArenas={builtInArenas} />;
}
