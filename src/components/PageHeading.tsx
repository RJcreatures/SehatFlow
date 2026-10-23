import { useEffect, type ReactNode } from "react"
import { appConfig } from "../config/hospital.ts"

export function PageHeading({ title, children }: { title: string; children?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · ${appConfig.name}`
  }, [title])

  return (
    <header className="page-heading">
      <h1>{title}</h1>
      {children}
    </header>
  )
}
