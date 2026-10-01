/*
  The 王者爭霸 in progress: the bracket survives the trip to a bout and back, and a reload, for
  as long as the browser session lasts (a cup is one sitting, like the client's event).
*/
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { KEY } from "@/lib/storage-keys";
import type { Bracket } from "./champion";

type Cup = { bracket: Bracket | null; set: (b: Bracket | null) => void };

export const useCup = create<Cup>()(
  persist((set) => ({ bracket: null, set: (bracket) => set({ bracket }) }), {
    name: KEY.cup,
    storage: createJSONStorage(() => sessionStorage),
    partialize: (s) => ({ bracket: s.bracket }),
  }),
);
