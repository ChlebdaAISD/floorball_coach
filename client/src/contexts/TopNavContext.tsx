import { createContext, useContext, useEffect, useState, type DependencyList, type ReactNode } from "react";
import { TopNav } from "@/components/TopNav";

export interface TopNavState {
  label?: string;
  title: string;
  right?: ReactNode;
}

interface TopNavContextType {
  state: TopNavState | null;
  setState: (s: TopNavState | null) => void;
}

const TopNavContext = createContext<TopNavContextType>({
  state: null,
  setState: () => {},
});

export function TopNavProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TopNavState | null>(null);
  return (
    <TopNavContext.Provider value={{ state, setState }}>{children}</TopNavContext.Provider>
  );
}

/**
 * Sets the top-nav header for the current page.
 * Pass a factory so the JSX is only built when deps change — this avoids
 * re-render loops caused by fresh object identities on every parent render.
 * Caller is responsible for listing every primitive that the factory reads.
 */
export function useSetTopNav(factory: () => TopNavState | null, deps: DependencyList) {
  const { setState } = useContext(TopNavContext);
  useEffect(() => {
    setState(factory());
    return () => setState(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function TopNavHost() {
  const { state } = useContext(TopNavContext);
  if (!state) return null;
  return <TopNav label={state.label} title={state.title} right={state.right} />;
}
