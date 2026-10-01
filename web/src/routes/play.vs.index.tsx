import { createFileRoute } from "@tanstack/react-router";
import { catalogQuery, charsQuery, StageSelect } from "@/game/stage-select";

export const Route = createFileRoute("/play/vs/")({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(catalogQuery),
      queryClient.ensureQueryData(charsQuery),
    ]),
  component: () => <StageSelect mode="vs" />,
});
