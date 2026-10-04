// A customer types their proposal's 6-digit code once; it's kept in a
// cookie for that proposal, so the page, view tracking and acceptance all
// pass it to the database (which checks it - see proposal_code_ok).
export function proposalCodeCookie(token: string) {
  return `pp_${token.slice(0, 16)}`;
}
