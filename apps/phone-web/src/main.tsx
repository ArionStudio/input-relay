import * as React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@input-relay/ui";
import { App } from "./App";
import "./styles.css";

document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="input-relay-theme">
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
