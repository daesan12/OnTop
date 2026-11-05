/** Development review entry; ranked records are verified by the server, with no coin reward. */
export function speedMoleTrialEnabled(
  hostname = typeof window === 'undefined' ? '' : window.location.hostname,
  development = import.meta.env.DEV,
) {
  return hostname === 'dev.on-top.world' || development && ['localhost', '127.0.0.1'].includes(hostname)
}
