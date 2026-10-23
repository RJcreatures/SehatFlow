import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource/noto-sans/400.css"
import "@fontsource/noto-sans/700.css"
import "@fontsource/noto-sans-devanagari/400.css"
import "@fontsource/noto-sans-devanagari/700.css"
import "./index.css"
import { App } from "./App.tsx"

const root = document.getElementById("root")
if (!root) {
  throw new Error("Root element missing")
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
