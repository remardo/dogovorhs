import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initBackendAuthFromStorage } from "@/lib/backend";

initBackendAuthFromStorage();
createRoot(document.getElementById("root")!).render(<App />);
