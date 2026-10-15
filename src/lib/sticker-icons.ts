import { STICKERS, type StickerId } from './buzzer/protocol'
import type { IconName } from '../components/Icon'

export const STICKER_ICON: Record<StickerId, IconName> = {
  airball: 'ball',
  brick: 'ban',
  swish: 'sparkle',
  'ice-cold': 'snow',
  'too-easy': 'bolt',
  'sit-down': 'arrow-down',
  'on-fire': 'flame',
  bench: 'whistle',
}

export const stickerLabel = (id: StickerId): string => STICKERS.find((s) => s.id === id)?.label ?? id
