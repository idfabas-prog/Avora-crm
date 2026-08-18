export const mobileBreakpoints = {
  phone: 375,
  largePhone: 430,
  tablet: 768,
  desktop: 1024
} as const;

export type MobileBreakpoint = keyof typeof mobileBreakpoints;

export function breakpointForWidth(width: number): MobileBreakpoint {
  if (width < mobileBreakpoints.largePhone) return "phone";
  if (width < mobileBreakpoints.tablet) return "largePhone";
  if (width < mobileBreakpoints.desktop) return "tablet";
  return "desktop";
}

export function isMobileWidth(width: number) {
  return breakpointForWidth(width) === "phone" || breakpointForWidth(width) === "largePhone";
}
