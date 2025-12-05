interface NavbarProps {
  roomId: string | null
}

export function Navbar({ roomId }: NavbarProps) {
  if (!roomId) {
    return null
  }

  return (
    <div className="mb-4 p-3 bg-stone-800/40 border border-stone-700 rounded-b-lg">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-stone-200">Room: </span>
          <span className="text-sm font-mono text-stone-100">{roomId}</span>
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}?room=${roomId}`)
            alert('Room link copied!')
          }}
          className="text-xs text-stone-300 hover:text-stone-200 underline"
        >
          Copy link
        </button>
      </div>
    </div>
  )
}

