import { useEffect, useState } from "react";
import { BattleScreen } from "./components/BattleScreen";
import { GameInfoPage } from "./components/GameInfoPage";

export function App() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (path: string) => {
    if (window.location.pathname === path) {
      return;
    }

    window.history.pushState({}, "", path);
    setPathname(path);
  };

  if (pathname.startsWith("/game-info")) {
    return <GameInfoPage pathname={pathname} navigate={navigate} />;
  }

  return <BattleScreen />;
}
