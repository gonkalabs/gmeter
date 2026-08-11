import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ComparePricesPage } from "./components/ComparePricesPage";
import { I18nProvider } from "./i18n";
import "./index.css";

const saved = localStorage.getItem("gmeter-theme");
document.documentElement.dataset.theme = saved === "dark" ? "dark" : "light";

const path = window.location.pathname.replace(/\/$/, "") || "/";

if (path === "/compare/start") {
  window.location.replace("/compare");
}

const isCompare = path === "/compare";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>{isCompare ? <ComparePricesPage /> : <App />}</I18nProvider>
  </StrictMode>
);
