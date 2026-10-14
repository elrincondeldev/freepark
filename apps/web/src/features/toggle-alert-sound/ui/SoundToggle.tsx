import { useCameraStore } from '@/entities/camera'
import { IconButton, MuteIcon, VolumeIcon } from '@/shared/ui'

export function SoundToggle() {
  const sound = useCameraStore((s) => s.settings.sound)
  const setSound = useCameraStore((s) => s.setSound)
  return (
    <IconButton
      size="md"
      label={sound ? 'Mute alert sound' : 'Play a sound with alerts'}
      title={sound ? 'Alert sound on' : 'Alert sound off'}
      aria-pressed={sound}
      onClick={() => setSound(!sound)}
    >
      {sound ? <VolumeIcon /> : <MuteIcon />}
    </IconButton>
  )
}
