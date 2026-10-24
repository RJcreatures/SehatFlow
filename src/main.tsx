import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource/noto-sans/400.css"
import "@fontsource/noto-sans/700.css"
import "@fontsource/noto-sans-devanagari/400.css"
import "@fontsource/noto-sans-devanagari/700.css"
import "@fontsource/noto-sans-gurmukhi/400.css"
import "@fontsource/noto-sans-gurmukhi/700.css"
import "@fontsource/noto-naskh-arabic/400.css"
import "@fontsource/noto-naskh-arabic/700.css"
import "@fontsource/noto-sans-bengali/400.css"
import "@fontsource/noto-sans-bengali/700.css"
import "@fontsource/noto-sans-tamil/400.css"
import "@fontsource/noto-sans-tamil/700.css"
import "@fontsource/noto-sans-telugu/400.css"
import "@fontsource/noto-sans-telugu/700.css"
import "@fontsource/noto-sans-gujarati/400.css"
import "@fontsource/noto-sans-gujarati/700.css"
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
