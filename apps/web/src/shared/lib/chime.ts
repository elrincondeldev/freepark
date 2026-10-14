let audio: AudioContext | null = null

/** Short two-note chime synthesised with Web Audio (no asset needed). */
export function playChime(): void {
  try {
    audio ??= new AudioContext()
    const ctx = audio
    const t = ctx.currentTime
    ;[880, 1318.5].forEach((freq, i) => {
      const start = t + i * 0.12
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.4)
    })
  } catch {
    /* audio unavailable */
  }
}
