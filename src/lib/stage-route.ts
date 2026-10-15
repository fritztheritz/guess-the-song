/** Routes where the room is watching the screen (a game being played) rather than filling in a form — these get the
 *  louder court backdrop and the page-wipe transition. */
export function isStageRoute(pathname: string): boolean {
  return /\/(present|display|rank-together|whose-pick|blind)$/.test(pathname) || pathname.startsWith('/buzz')
}
