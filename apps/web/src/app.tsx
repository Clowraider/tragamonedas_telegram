import React, { useEffect } from "react";
import { SlotMachine } from "./slot/SlotMachine.js";
import { initTelegramApp, isTelegramEnvironment } from "./telegram.js";
import { defaultApiClient } from "./api.js";

export interface AppProps {
  isDevMode?: boolean | undefined;
}

export const App: React.FC<AppProps> = ({ isDevMode }) => {
  const isTelegram = isTelegramEnvironment();
  const showDevBadge = isDevMode ?? !isTelegram;

  useEffect(() => {
    initTelegramApp();
  }, []);

  return (
    <SlotMachine
      apiClient={defaultApiClient}
      isDevelopmentMode={showDevBadge}
    />
  );
};

export default App;
