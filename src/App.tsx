import { Suspense } from 'react'
import { lazyPage } from './lib/lazy-page'
import { Route, Routes } from 'react-router-dom'
import { PageSkeleton } from './components/skeletons'
import Home from './pages/Home'
import RequireFlag from './components/RequireFlag'

const CreateGame = lazyPage(() => import('./pages/CreateGame'))
const GameBuilder = lazyPage(() => import('./pages/GameBuilder'))
const Presentation = lazyPage(() => import('./pages/Presentation'))
const Callback = lazyPage(() => import('./pages/Callback'))
const ImportGame = lazyPage(() => import('./pages/ImportGame'))
const SharedDraftResults = lazyPage(() => import('./pages/SharedDraftResults'))
const Stats = lazyPage(() => import('./pages/Stats'))
const Admin = lazyPage(() => import('./pages/Admin'))
const CreateTierList = lazyPage(() => import('./pages/CreateTierList'))
const TierListBuilder = lazyPage(() => import('./pages/TierListBuilder'))
const TierListPresent = lazyPage(() => import('./pages/TierListPresent'))
const TierListDisplay = lazyPage(() => import('./pages/TierListDisplay'))
const PlayerBuzzer = lazyPage(() => import('./pages/PlayerBuzzer'))
const CreateTournament = lazyPage(() => import('./pages/CreateTournament'))
const TournamentBuilder = lazyPage(() => import('./pages/TournamentBuilder'))
const CreateSeason = lazyPage(() => import('./pages/CreateSeason'))
const SeasonBoard = lazyPage(() => import('./pages/SeasonBoard'))
const CreateDraftBoard = lazyPage(() => import('./pages/CreateDraftBoard'))
const DraftBoardHome = lazyPage(() => import('./pages/DraftBoardHome'))
const DraftSessionRoom = lazyPage(() => import('./pages/DraftSessionRoom'))
const DraftPresentation = lazyPage(() => import('./pages/DraftPresentation'))
const CreatePopularityGame = lazyPage(() => import('./pages/CreatePopularityGame'))
const PopularityPresent = lazyPage(() => import('./pages/PopularityPresent'))
const CreateTimelineGame = lazyPage(() => import('./pages/CreateTimelineGame'))
const TimelinePresent = lazyPage(() => import('./pages/TimelinePresent'))

export default function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/new" element={<CreateGame />} />
      <Route path="/games/:gameId/edit" element={<GameBuilder />} />
      <Route path="/games/:gameId/present" element={<Presentation />} />
      <Route path="/callback" element={<Callback />} />
      <Route path="/import" element={<ImportGame />} />
      <Route path="/share/results" element={<SharedDraftResults />} />
      <Route path="/stats" element={<Stats />} />
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
      <Route
        path="/tierlists/:tierListId/display"
        element={
          <RequireFlag flag="tier-lists">
            <TierListDisplay />
          </RequireFlag>
        }
      />
      <Route
        path="/tournaments/new"
        element={
          <RequireFlag flag="tournaments">
            <CreateTournament />
          </RequireFlag>
        }
      />
      <Route
        path="/tournaments/:tournamentId"
        element={
          <RequireFlag flag="tournaments">
            <TournamentBuilder />
          </RequireFlag>
        }
      />
      <Route
        path="/seasons/new"
        element={
          <RequireFlag flag="seasons">
            <CreateSeason />
          </RequireFlag>
        }
      />
      <Route
        path="/seasons/:seasonId"
        element={
          <RequireFlag flag="seasons">
            <SeasonBoard />
          </RequireFlag>
        }
      />
      <Route
        path="/drafts/new"
        element={
          <RequireFlag flag="draft">
            <CreateDraftBoard />
          </RequireFlag>
        }
      />
      <Route
        path="/drafts/:boardId"
        element={
          <RequireFlag flag="draft">
            <DraftBoardHome />
          </RequireFlag>
        }
      />
      <Route
        path="/drafts/:boardId/sessions/:sessionId"
        element={
          <RequireFlag flag="draft">
            <DraftSessionRoom />
          </RequireFlag>
        }
      />
      <Route
        path="/drafts/:boardId/sessions/:sessionId/present"
        element={
          <RequireFlag flag="draft">
            <DraftPresentation />
          </RequireFlag>
        }
      />
      <Route
        path="/popularity/new"
        element={
          <RequireFlag flag="popularity">
            <CreatePopularityGame />
          </RequireFlag>
        }
      />
      <Route
        path="/popularity/:gameId/present"
        element={
          <RequireFlag flag="popularity">
            <PopularityPresent />
          </RequireFlag>
        }
      />
      <Route
        path="/timeline/new"
        element={
          <RequireFlag flag="timeline">
            <CreateTimelineGame />
          </RequireFlag>
        }
      />
      <Route
        path="/timeline/:gameId/present"
        element={
          <RequireFlag flag="timeline">
            <TimelinePresent />
          </RequireFlag>
        }
      />
    </Routes>
    </Suspense>
  )
}
