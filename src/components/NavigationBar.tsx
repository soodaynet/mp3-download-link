import { type FC } from 'react'

export type Page = 'download' | 'unlock'

interface Props {
  current: Page
  onChange: (page: Page) => void
}

const TABS: { key: Page; label: string }[] = [
  { key: 'download', label: '链接转换' },
  { key: 'unlock', label: '格式转换' },
]

export const NavigationBar: FC<Props> = ({ current, onChange }) => {
  return (
    <nav className="sticky top-0 z-20 border-b border-white/[0.06] backdrop-blur-md bg-white/20">
      <div className="max-w-xl mx-auto px-4">
        <div className="flex items-center justify-center gap-1 py-3">
          {TABS.map((tab) => {
            const active = current === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => onChange(tab.key)}
                className={`px-5 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${
                  active
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-white/30 hover:text-white/60 hover:bg-white/[0.04]'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}