import { BrowserRouter, Route, Routes } from "react-router"
import { PatientLayout } from "./components/PatientLayout.tsx"
import { StaffLayout } from "./components/StaffLayout.tsx"
import { BoardPage } from "./pages/BoardPage.tsx"
import { EmergencyPage } from "./pages/EmergencyPage.tsx"
import { FindPage } from "./pages/FindPage.tsx"
import { ForecastPage } from "./pages/ForecastPage.tsx"
import { HomePage } from "./pages/HomePage.tsx"
import { MyTurnPage } from "./pages/MyTurnPage.tsx"
import { NotFoundPage } from "./pages/NotFoundPage.tsx"
import { RegisterPage } from "./pages/RegisterPage.tsx"
import { SettingsPage } from "./pages/SettingsPage.tsx"
import { SlipPage } from "./pages/SlipPage.tsx"
import { StaffPage } from "./pages/StaffPage.tsx"
import { PreferencesProvider } from "./preferences/PreferencesProvider.tsx"

export function App() {
  return (
    <PreferencesProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<PatientLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/my-turn" element={<MyTurnPage />} />
            <Route path="/slip" element={<SlipPage />} />
            <Route path="/find" element={<FindPage />} />
            <Route path="/emergency" element={<EmergencyPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route element={<StaffLayout />}>
            <Route path="/staff" element={<StaffPage />} />
            <Route path="/staff/forecast" element={<ForecastPage />} />
          </Route>
          <Route path="/board" element={<BoardPage />} />
        </Routes>
      </BrowserRouter>
    </PreferencesProvider>
  )
}
