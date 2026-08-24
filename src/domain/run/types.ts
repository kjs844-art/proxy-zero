export type ZoneId = 'n9-depot' | 'service-train' | 'flooded-tunnel'

export interface ZoneEntry {
  readonly zoneId: ZoneId
  readonly zoneStartWaveId: string
}
