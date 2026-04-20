import type { Dispatch, SetStateAction } from 'react'
import type { RoomHandlerContext } from '../session/room'
import {
  handleCreateRoom as createRoomConnection,
  handleJoinRoom as joinRoomConnection,
} from '../session/room'

interface HomeProps {
  joinRoomId: string
  setJoinRoomId: Dispatch<SetStateAction<string>>
  errorMessage: string
  roomId: string | null
  roomHandlerContext: RoomHandlerContext
}

export function Home({
  joinRoomId,
  setJoinRoomId,
  errorMessage,
  roomId,
  roomHandlerContext,
}: HomeProps) {
  const handleCreateRoom = () => {
    createRoomConnection(roomHandlerContext)
  }

  const handleJoinRoom = () => {
    joinRoomConnection(roomHandlerContext, joinRoomId)
  }

  return (
    <section className="xl:w-6/10 w-9/10 mx-auto mb-[120px]">
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="bg-stone-900/90 border-2 border-stone-700 rounded-2xl shadow-2xl p-8 w-full max-w-md backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-stone-100 mb-6 text-center">Join a Room</h1>
          
          {errorMessage && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-800 text-red-200 rounded-lg text-sm">
              {errorMessage}
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={handleCreateRoom}
              className="w-full py-3 px-4 bg-stone-700 hover:bg-stone-600 text-stone-50 font-semibold rounded-lg transition-colors shadow-lg"
            >
              Create New Room
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-600/50"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-stone-900/90 text-stone-300">Or</span>
              </div>
            </div>

            <div>
              <label htmlFor="roomId" className="block text-sm font-medium text-stone-200 mb-2">
                Enter Room ID
              </label>
              <input
                id="roomId"
                type="text"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                placeholder="e.g., a1b2c3d4"
                className="w-full px-4 py-2 bg-stone-800/50 border-2 border-stone-700 rounded-lg focus:border-stone-600 focus:outline-none text-stone-100 placeholder-stone-500"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleJoinRoom()
                  }
                }}
              />
            </div>

            <button
              onClick={handleJoinRoom}
              className="w-full py-3 px-4 bg-stone-700 hover:bg-stone-600 text-stone-50 font-semibold rounded-lg transition-colors shadow-lg"
            >
              Join Room
            </button>
          </div>

          {roomId && (
            <div className="mt-6 p-4 bg-stone-800/40 border border-stone-700 rounded-lg">
              <p className="text-sm text-stone-200 font-medium mb-2">Room ID:</p>
              <p className="text-lg font-mono text-stone-100 break-all">{roomId}</p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}?room=${roomId}`)
                  alert('Room link copied to clipboard!')
                }}
                className="mt-2 text-sm text-stone-300 hover:text-stone-200 underline"
              >
                Copy room link
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

