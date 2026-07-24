import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ElementLight } from "./screens/ElementLight";

createRoot(document.getElementById("app") as HTMLElement).render(
  <StrictMode>
    <ElementLight />
  </StrictMode>,
);
