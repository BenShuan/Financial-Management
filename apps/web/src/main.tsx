import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AccessGate } from "./components/AccessGate";
import "./index.css";
import { initSystemColorScheme } from "./theme";

initSystemColorScheme();

const queryClient = new QueryClient();

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AccessGate>
          <App />
        </AccessGate>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
