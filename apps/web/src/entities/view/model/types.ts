/** A saved camera viewpoint (cameras rotate between a few fixed directions). */
export interface View {
  id: number
  cameraId: string
  name: string
  createdAt: string
  referenceUrl: string | null
  exemplarCount: number
  zoneCount: number
}
