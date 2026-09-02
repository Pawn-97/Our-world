/**
 * Access code for the published static site.
 *
 * The code is stored masked so it never appears as plain text in the public
 * repository or in the production bundle. That is the whole point of the mask:
 * this gate keeps casual visitors out, it does not keep a determined one.
 * GitHub Pages still ships the entire site to anyone who asks for it, so the
 * payload behind the door is reachable regardless of what is typed here.
 */
const CODE_MASK = 0x5a
const maskedAccessCode = [0x63, 0x69, 0x63, 0x6d]

const maskedCodeEquals = (input: string): boolean =>
  input.length === maskedAccessCode.length
  && [...input].every((character, index) => character.charCodeAt(0) === (maskedAccessCode[index] ^ CODE_MASK))

export const normalizeAccessCode = (input: string): string => input.trim()

export function isAccessCodeCorrect(input: string): boolean {
  const candidate = normalizeAccessCode(input)
  if (candidate.length === 0) return false
  return maskedCodeEquals(candidate)
}
