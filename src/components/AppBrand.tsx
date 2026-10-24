import { Link } from "react-router"
import { appConfig } from "../config/hospital.ts"
import logoMark from "../logo/sehatflow-mark.png"
import logoLockup from "../logo/sehatflownobg.png"

type AppBrandProps = {
  to?: string
  /** Compact header mark + wordmark. */
  variant?: "header" | "hero" | "lockup"
  showTagline?: boolean
  subtitle?: string
  subtitleLang?: string
}

export function AppBrand({
  to,
  variant = "header",
  showTagline = false,
  subtitle,
  subtitleLang,
}: AppBrandProps) {
  const content =
    variant === "lockup" ? (
      <img
        className="brand-lockup"
        src={logoLockup}
        alt={`${appConfig.name} — ${appConfig.tagline}`}
        width={280}
        height={280}
        decoding="async"
      />
    ) : (
      <>
        <span className="brand-mark-row">
          <img
            className="brand-mark"
            src={logoMark}
            alt=""
            width={40}
            height={40}
            decoding="async"
          />
          <span className="brand-wordmark">{appConfig.name}</span>
        </span>
        {showTagline || variant === "hero" ? (
          <span className="brand-tagline">{appConfig.tagline}</span>
        ) : null}
      </>
    )

  const block =
    to !== undefined ? (
      <Link className={`brand brand-${variant}`} to={to} aria-label={appConfig.name}>
        {content}
      </Link>
    ) : (
      <p className={`brand brand-${variant}`}>{content}</p>
    )

  return (
    <div className="brand-block">
      {block}
      {subtitle ? (
        <p className="hospital" lang={subtitleLang}>
          {subtitle}
        </p>
      ) : null}
    </div>
  )
}
