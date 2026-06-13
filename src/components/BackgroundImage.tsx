import { type FC } from 'react'

interface Props {
  bgUrl: string
  loaded: boolean
}

export const BackgroundImage: FC<Props> = ({ bgUrl, loaded }) => {
  if (!bgUrl || !loaded) return null

  return (
    <div className="fixed inset-0 z-0">
      <div
        className="absolute inset-0 bg-cover bg-center bg-fixed"
        style={{ backgroundImage: 'var(--bg-image)' }}
      />
    </div>
  )
}