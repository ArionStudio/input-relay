import * as React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@input-relay/ui";
import { App } from "./App";
import "./styles.css";

const storedTheme = localStorage.getItem("input-relay-theme");
const initialTheme =
  storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
    ? storedTheme
    : "dark";
const resolvedTheme =
  initialTheme === "system"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : initialTheme;

document.documentElement.classList.add(resolvedTheme);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="input-relay-theme">
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
