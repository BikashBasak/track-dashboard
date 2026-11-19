/**
 * Optional paid providers. Wire these only with keys you purchased.
 * See README.md — competitor keys are not used or stored.
 */

export function hasOfficialProviders() {
  return Boolean(
    process.env.SENSORTOWER_API_TOKEN ||
      process.env.APPTWEAK_API_KEY ||
      process.env.FORTYTWOMATTERS_ACCESS_TOKEN,
  );
}

export function officialProviderStatus() {
  return {
    sensorTower: Boolean(process.env.SENSORTOWER_API_TOKEN),
    appTweak: Boolean(process.env.APPTWEAK_API_KEY),
    fortyTwoMatters: Boolean(process.env.FORTYTWOMATTERS_ACCESS_TOKEN),
    appfigures: Boolean(process.env.APPFIGURES_CLIENT_KEY && process.env.APPFIGURES_CLIENT_SECRET),
    playDeveloperApi: Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON),
  };
}
