import { Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import CreateGame from './pages/CreateGame'
import GameBuilder from './pages/GameBuilder'
import Presentation from './pages/Presentation'
import Callback from './pages/Callback'
import ImportGame from './pages/ImportGame'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/new" element={<CreateGame />} />
      <Route path="/games/:gameId/edit" element={<GameBuilder />} />
      <Route path="/games/:gameId/present" element={<Presentation />} />
      <Route path="/callback" element={<Callback />} />
      <Route path="/import" element={<ImportGame />} />
    </Routes>
  )
}
