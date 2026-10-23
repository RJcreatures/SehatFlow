export type OnboardingVisitChoice = "emergency" | "normal"

/** Where onboarding sends the visitor after they choose a visit type. */
export function onboardingVisitPath(choice: OnboardingVisitChoice): "/emergency" | "/" {
  return choice === "emergency" ? "/emergency" : "/"
}
