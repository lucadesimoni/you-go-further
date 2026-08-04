/**
 * Representative provider payloads, in each service's **own** shape.
 *
 * These exist because the live APIs cannot be called from CI: every one of them
 * needs a registered developer application, a client secret, a real athlete
 * account with real training in it, and an interactive OAuth consent. A test
 * that skips all of that and feeds our adapters *our own* idea of a payload
 * proves only that we agree with ourselves.
 *
 * So each fixture is written to the shape each provider actually publishes,
 * including the specific things that break naive importers:
 *
 * - **Garmin** sends `activityType` as a plain string enum and the start time as
 *   `startTimeInSeconds` + `startTimeOffsetInSeconds`. The *internal* Garmin
 *   Connect web endpoints use `{ typeKey }` and `startTimeGMT` instead, and the
 *   two are easy to confuse — a normaliser written against the wrong one reads
 *   every sport as "other" and stamps every session with today's date.
 * - **Polar** hyphenates its keys and sends duration as an ISO-8601 period
 *   (`PT1H4M30S`), not seconds.
 * - **Suunto** reports heart rate in **hertz** — beats per second — and gives
 *   the sport as a numeric enum, not a name.
 * - **Strava** returns `kilojoules` (mechanical work) on rides with a power
 *   meter, which is not the same quantity as dietary calories, and paginates at
 *   200 per page.
 *
 * Values are realistic Swiss sessions rather than round numbers, because round
 * numbers hide unit bugs: 42195 m reads wrong immediately if something divides
 * by 1000 twice, where 10000 does not.
 *
 * **Unverified against the live documentation** — this environment cannot reach
 * any provider host. `scripts/verify-providers.mjs` is the script that checks
 * these shapes against the real APIs wherever credentials and network exist.
 */

/** Strava `GET /athlete/activities` → SummaryActivity[]. */
export const STRAVA_ACTIVITIES = [
  {
    id: 11857392041,
    name: "Jungfrau Marathon",
    type: "Run",
    sport_type: "TrailRun",
    start_date: "2026-09-05T06:35:00Z",
    start_date_local: "2026-09-05T08:35:00Z",
    timezone: "(GMT+01:00) Europe/Zurich",
    moving_time: 16_842,
    elapsed_time: 17_010,
    distance: 42_195.0,
    total_elevation_gain: 1823.0,
    average_heartrate: 158.4,
    max_heartrate: 181.0,
    average_speed: 2.505,
    achievement_count: 3,
    athlete: { id: 4821, resource_state: 1 },
  },
  {
    // A ride with a power meter: `kilojoules` is mechanical work, and there is
    // no `calories` field on a SummaryActivity at all.
    id: 11857001234,
    name: "Sustenpass",
    type: "Ride",
    sport_type: "GravelRide",
    start_date: "2026-08-22T07:10:00Z",
    moving_time: 14_400,
    elapsed_time: 15_930,
    distance: 118_400.0,
    total_elevation_gain: 2140.0,
    average_heartrate: 141.2,
    max_heartrate: 172.0,
    average_watts: 212.5,
    weighted_average_watts: 238,
    device_watts: true,
    kilojoules: 3060.0,
  },
  {
    // Indoor: no distance, no elevation, no GPS. A normaliser that assumes
    // distance exists produces NaN pace downstream.
    id: 11856000777,
    name: "Zwift — sweet spot",
    type: "VirtualRide",
    sport_type: "VirtualRide",
    start_date: "2026-08-20T17:45:00Z",
    moving_time: 3600,
    elapsed_time: 3600,
    distance: 0,
    total_elevation_gain: 0,
    average_watts: 245.0,
    device_watts: true,
    kilojoules: 882.0,
    trainer: true,
  },
  {
    // A pool swim: `sport_type` Strava does not model as a distinct enum, and
    // heart rate is absent because the strap does not read underwater.
    id: 11855123456,
    name: "Hallenbad",
    type: "Swim",
    sport_type: "Swim",
    start_date: "2026-08-19T06:00:00Z",
    moving_time: 2700,
    elapsed_time: 3120,
    distance: 2200.0,
    total_elevation_gain: 0,
  },
  {
    // A walk. Not training, and it must not be silently counted as one.
    id: 11854999888,
    name: "Spaziergang",
    type: "Walk",
    sport_type: "Walk",
    start_date: "2026-08-18T18:30:00Z",
    moving_time: 2280,
    elapsed_time: 2400,
    distance: 2700.0,
    total_elevation_gain: 15.0,
  },
];

/**
 * Garmin Health API `GET /wellness-api/rest/activities` → activity summaries.
 *
 * Note `activityType` is a **string**, the start time is epoch seconds plus a
 * local offset, and ascent is `totalElevationGainInMeters`.
 */
export const GARMIN_ACTIVITIES = [
  {
    userId: "d3315b1072b5b4b39c4b18bb3d1b7e2f",
    summaryId: "9480958402",
    activityId: 9480958402,
    activityName: "Zürich Marathon",
    activityType: "RUNNING",
    // 2026-04-14T06:30:00Z, recorded in CEST (+2h).
    startTimeInSeconds: 1_776_148_200,
    startTimeOffsetInSeconds: 7200,
    durationInSeconds: 11_580,
    distanceInMeters: 42_195.0,
    totalElevationGainInMeters: 52.0,
    averageHeartRateInBeatsPerMinute: 162,
    maxHeartRateInBeatsPerMinute: 178,
    activeKilocalories: 2841,
    averageSpeedInMetersPerSecond: 3.644,
    averagePaceInMinutesPerKilometer: 4.573,
    deviceName: "forerunner965",
  },
  {
    summaryId: "9480111222",
    activityId: 9480111222,
    activityName: "Uetliberg",
    activityType: "TRAIL_RUNNING",
    startTimeInSeconds: 1_775_888_400,
    startTimeOffsetInSeconds: 7200,
    durationInSeconds: 5_940,
    distanceInMeters: 14_800.0,
    totalElevationGainInMeters: 620.0,
    averageHeartRateInBeatsPerMinute: 149,
    maxHeartRateInBeatsPerMinute: 171,
    activeKilocalories: 1042,
    deviceName: "fenix8",
  },
  {
    summaryId: "9479000111",
    activityId: 9479000111,
    activityType: "CYCLING",
    startTimeInSeconds: 1_775_628_000,
    startTimeOffsetInSeconds: 7200,
    durationInSeconds: 9_000,
    distanceInMeters: 74_300.0,
    totalElevationGainInMeters: 980.0,
    averageHeartRateInBeatsPerMinute: 138,
    averagePowerInWatts: 198,
    activeKilocalories: 1780,
    // No activityName: Garmin omits it when the athlete never renamed it.
  },
  {
    // The *other* shape, from the internal Garmin Connect web endpoints. Both
    // exist in the wild, and an importer that only knows one loses the sport
    // and the date of every session it sees from the other.
    activityId: 9478555444,
    activityName: "Abendlauf",
    activityType: { typeId: 1, typeKey: "running" },
    startTimeGMT: "2026-04-08 17:05:00",
    durationInSeconds: 3_120,
    distanceInMeters: 10_400.0,
    elevationGainInMeters: 88.0,
    averageHeartRateInBeatsPerMinute: 152,
    maxHeartRateInBeatsPerMinute: 169,
    activeKilocalories: 720,
  },
];

/** Polar AccessLink `GET /v3/exercises` → exercise[]. Hyphenated keys, ISO duration. */
export const POLAR_EXERCISES = [
  {
    id: 1_937_529_874,
    "upload-time": "2026-05-17T11:02:41.000Z",
    "polar-user": "https://www.polaraccesslink.com/v3/users/1234567",
    device: "Polar Vantage V3",
    "start-time": "2026-05-17T09:12:00",
    "start-time-utc-offset": 120,
    duration: "PT1H44M30S",
    calories: 1180,
    distance: 21_097.5,
    "heart-rate": { average: 156, maximum: 176 },
    "training-load": 143.22,
    sport: "RUNNING",
    "has-route": true,
    "detailed-sport-info": "RUNNING",
  },
  {
    id: 1_937_600_001,
    "upload-time": "2026-05-14T18:40:00.000Z",
    device: "Polar Grit X2",
    "start-time": "2026-05-14T16:05:00",
    "start-time-utc-offset": 120,
    // Hours and minutes only — no seconds component at all.
    duration: "PT2H35M",
    calories: 1640,
    distance: 63_200.0,
    "heart-rate": { average: 134, maximum: 165 },
    "training-load": 211.5,
    sport: "CYCLING",
    "detailed-sport-info": "ROAD_BIKING",
  },
  {
    id: 1_937_700_002,
    "upload-time": "2026-05-11T07:30:00.000Z",
    device: "Polar Vantage V3",
    "start-time": "2026-05-11T06:30:00",
    "start-time-utc-offset": 120,
    // Minutes only. The pattern has to survive every missing component.
    duration: "PT48M",
    calories: 410,
    "heart-rate": { average: 121 },
    sport: "OTHER",
    "detailed-sport-info": "STRENGTH_TRAINING",
    // No distance at all — indoor strength work.
  },
];

/**
 * Suunto `GET /v2/workouts` → payload.
 *
 * Heart rate is in **hertz**, and the sport is a numeric enum. Both are the kind
 * of thing that produces a plausible-looking number rather than an error: an
 * average heart rate of 2.6 does not throw, it just quietly ruins every
 * intensity estimate downstream.
 */
export const SUUNTO_WORKOUTS = [
  {
    workoutId: 601_234_567,
    workoutKey: "60f3a1b2c4d5e6f7a8b9c0d1",
    activityId: 1, // running
    startTime: 1_781_500_800_000, // epoch MILLIseconds
    totalTime: 7_245.0,
    totalDistance: 21_097.0,
    totalAscent: 310.0,
    hrmax: 2.983_333, // 179 bpm
    hravg: 2.616_667, // 157 bpm
    energyConsumption: 1_420.0,
    activityName: "Halbmarathon Luzern",
  },
  {
    workoutId: 601_234_890,
    workoutKey: "60f3a1b2c4d5e6f7a8b9c0d2",
    activityId: 3, // cycling
    startTime: 1_781_241_600_000,
    totalTime: 12_600.0,
    totalDistance: 92_400.0,
    totalAscent: 1_240.0,
    hrmax: 2.75, // 165 bpm
    hravg: 2.283_333, // 137 bpm
    energyConsumption: 2_310.0,
  },
  {
    // Trail running, and the string form some Suunto payloads carry instead.
    workoutId: 601_235_111,
    workoutKey: "60f3a1b2c4d5e6f7a8b9c0d3",
    activityType: "TrailRunning",
    startTime: 1_780_982_400_000,
    totalTime: 9_900.0,
    totalDistance: 24_600.0,
    totalAscent: 1_450.0,
    // Already in bpm on this one — the field is not consistent across firmware.
    hravg: 148,
    hrmax: 172,
    energyConsumption: 1_980.0,
  },
];

/** Every fixture set, for tests that want to sweep all providers at once. */
export const PROVIDER_FIXTURES = {
  strava: STRAVA_ACTIVITIES,
  garmin: GARMIN_ACTIVITIES,
  polar: POLAR_EXERCISES,
  suunto: SUUNTO_WORKOUTS,
} as const;
