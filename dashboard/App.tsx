import { useState } from "react";

import { ApiKeyGate } from "./src/components/ApiKeyGate";
import { Dashboard }  from "./src/components/Dashboard";

export default function App() {
  const [socket, setSocket] = useState<null | string>(() => localStorage.getItem("socket"));
  const [key, setKey]    = useState<null | string>(() => localStorage.getItem("api_key"));

  if (!socket || !key) return <ApiKeyGate onSubmit={(s, k) => {
    setSocket(s)
    setKey(k)
  }} />

  return <Dashboard apiKey={key} socket={socket} />
}
