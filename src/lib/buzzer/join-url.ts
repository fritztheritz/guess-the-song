export function joinUrl(code: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}buzz/${code}`
}
