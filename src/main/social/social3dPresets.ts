/**
 * social3dPresets — presetId → 默认 SE/SP/SO（非 TISOR）
 */

export type Social3D = { se: number; sp: number; so: number }

const TABLE: Record<string, Social3D> = {
  tsundere: { se: 55, sp: 70, so: 65 },
  yandere: { se: 70, sp: 85, so: 60 },
  oneesan: { se: 60, sp: 65, so: 55 },
  genki: { se: 90, sp: 40, so: 90 },
  kuudere: { se: 25, sp: 55, so: 20 },
  deredere: { se: 75, sp: 80, so: 70 },
  shitakiri: { se: 65, sp: 50, so: 75 },
  bokke: { se: 70, sp: 35, so: 60 },
  ice_queen: { se: 20, sp: 60, so: 15 },
  girl_next_door: { se: 55, sp: 55, so: 55 },
  ceo_dom: { se: 70, sp: 40, so: 75 },
  gentle_warmth: { se: 60, sp: 75, so: 55 },
  puppy: { se: 85, sp: 70, so: 80 },
  iceberg: { se: 20, sp: 50, so: 15 },
  schemer: { se: 45, sp: 80, so: 50 },
  loyal_knight: { se: 50, sp: 55, so: 45 },
  bad_boy: { se: 75, sp: 45, so: 70 },
  artistic: { se: 40, sp: 85, so: 55 },
  innocent_boy: { se: 65, sp: 40, so: 55 },
  boy_next_door: { se: 50, sp: 50, so: 50 },
  submissive: { se: 40, sp: 70, so: 35 },
  dominatrix: { se: 75, sp: 55, so: 80 },
  loyal_pup: { se: 55, sp: 65, so: 50 },
  tamer: { se: 70, sp: 50, so: 75 },
  mommy: { se: 65, sp: 80, so: 60 },
  mesugaki: { se: 80, sp: 50, so: 85 },
  gap_moe_f: { se: 55, sp: 70, so: 50 },
  daddy: { se: 60, sp: 70, so: 55 },
  gap_moe_m: { se: 50, sp: 65, so: 45 },
}

const FALLBACK: Social3D = { se: 50, sp: 50, so: 50 }

export function social3dForPreset(presetId: string): Social3D {
  return TABLE[presetId] ?? { ...FALLBACK }
}
