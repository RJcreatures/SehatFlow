import { Navigate } from "react-router"

/** Legacy route — queue status and recovery live on My Slip. */
export function MyTurnPage() {
  return <Navigate to="/slip" replace />
}
