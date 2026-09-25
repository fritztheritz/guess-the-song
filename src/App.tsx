import { Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import CreateGame from './pages/CreateGame'
import GameBuilder from './pages/GameBuilder'
import Presentation from './pages/Presentation'
import Callback from './pages/Callback'
import ImportGame from './pages/ImportGame'
import Admin from './pages/Admin'
import CreateTierList from './pages/CreateTierList'
import TierListBuilder from './pages/TierListBuilder'
import TierListPresent from './pages/TierListPresent'
import PlayerBuzzer from './pages/PlayerBuzzer'
import RequireFlag from './components/RequireFlag'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/new" element={<CreateGame />} />
      <Route path="/games/:gameId/edit" element={<GameBuilder />} />
      <Route path="/games/:gameId/present" element={<Presentation />} />
      <Route path="/callback" element={<Callback />} />
      <Route path="/import" element={<ImportGame />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/buzz" element={<PlayerBuzzer />} />
      <Route path="/buzz/:code" element={<PlayerBuzzer />} />
      <Route
        path="/tierlists/new"
        element={
          <RequireFlag flag="tier-lists">
            <CreateTierList />
          </RequireFlag>
        }
      />
      <Route
        path="/tierlists/:tierListId/edit"
        element={
          <RequireFlag flag="tier-lists">
            <TierListBuilder />
          </RequireFlag>
        }
      />
      <Route
        path="/tierlists/:tierListId/present"
        element={
          <RequireFlag flag="tier-lists">
            <TierListPresent />
          </RequireFlag>
        }
      />
    </Routes>
  )
}
