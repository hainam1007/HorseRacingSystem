import "./App.css";
import { Navigate, Route, Routes } from "react-router-dom";
import AdminDashboard from "./Admin/AdminDashboard";
import AdminModulePage from "./Admin/AdminModulePage";
import LandingPage from "./Landing Page/LandingPage";
import Login from "./Login/Login";
import SignUp from "./SignUp/SignUp";
import MainLayout from "./layouts/MainLayout";
import SpectatorHome from "./pages/spectator/SpectatorHome";
import TournamentList from "./pages/spectator/TournamentList";
import TournamentDetail from "./pages/spectator/TournamentDetail";
import RaceDetail from "./pages/spectator/RaceDetail";
import Predictions from "./pages/spectator/Predictions";
import PredictionDetail from "./pages/spectator/PredictionDetail";
import BetHistory from "./pages/spectator/BetHistory";
import Profile from "./pages/spectator/Profile";
import Deposit from "./pages/spectator/Deposit";
import PaymentReturn from "./pages/spectator/PaymentReturn";
import Rewards from "./pages/spectator/Rewards";
import RoleApplications from "./pages/applications/RoleApplications";
import OwnerDashboard from "./pages/owner/OwnerDashboard";
import OwnerLayout from "./pages/owner/OwnerLayout";
import OwnerDepositHistory from "./pages/owner/OwnerDepositHistory";
import JockeyAssignments from "./pages/jockey/JockeyAssignments";
import JockeyDashboard from "./pages/jockey/JockeyDashboard";
import JockeyInvitations from "./pages/jockey/JockeyInvitations";
import JockeyLayout from "./pages/jockey/JockeyLayout";
import JockeyProfile from "./pages/jockey/JockeyProfile";
import JockeyResults from "./pages/jockey/JockeyResults";
import JockeySchedule from "./pages/jockey/JockeySchedule";
import ProtectedRoute from "./auth/ProtectedRoute";
import WorkspaceChooser from "./auth/WorkspaceChooser";
import {
  OwnerHorseDetail,
  OwnerHorseForm,
  OwnerHorses,
  OwnerJockeys,
  OwnerProfile,
  OwnerRaceDetail,
  OwnerRegistrations,
  OwnerResults,
  OwnerSchedule,
} from "./pages/owner/OwnerPages";
import RefereeDashboard from "./Referee/RefereeDashboard";
import RefereeRaces from "./Referee/RefereeRaces";
import RefereeRaceDetail from "./Referee/RefereeRaceDetail";
import HorseInspection from "./Referee/HorseInspection";
import JockeyInspection from "./Referee/JockeyInspection";
import RaceMonitor from "./Referee/RaceMonitor";
import ViolationManagement from "./Referee/ViolationManagement";
import RaceClosure from "./Referee/RaceClosure";
import AuthRecovery from "./auth/AuthRecovery";
import VerifyAccount from "./auth/VerifyAccount";

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/:module" element={<ProtectedRoute role="admin"><AdminModulePage /></ProtectedRoute>} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/verify-account" element={<VerifyAccount />} />
      <Route path="/forgot-password" element={<AuthRecovery mode="forgot" />} />
      <Route path="/reset-password" element={<AuthRecovery mode="reset" />} />
      <Route path="/resend-verification" element={<AuthRecovery mode="resend" />} />
      <Route path="/change-password" element={<ProtectedRoute><AuthRecovery mode="change" /></ProtectedRoute>} />
      <Route path="/choose-role" element={<WorkspaceChooser />} />

      <Route path="/owner" element={<ProtectedRoute role="horse_owner"><OwnerLayout /></ProtectedRoute>}>
        <Route index element={<OwnerDashboard />} />
        <Route path="horses" element={<OwnerHorses />} />
        <Route path="horses/new" element={<OwnerHorseForm />} />
        <Route path="horses/:horseId" element={<OwnerHorseDetail />} />
        <Route path="horses/:horseId/edit" element={<OwnerHorseForm mode="edit" />} />
        <Route path="registrations" element={<OwnerRegistrations />} />
        <Route path="deposit-history" element={<OwnerDepositHistory />} />
        <Route path="tournaments/:tournamentId/races/:raceId" element={<OwnerRaceDetail />} />
        <Route path="jockeys" element={<OwnerJockeys />} />
        <Route path="schedule" element={<OwnerSchedule />} />
        <Route path="results" element={<OwnerResults />} />
        <Route path="profile" element={<OwnerProfile />} />
      </Route>

      <Route path="/jockey" element={<ProtectedRoute role="jockey"><JockeyLayout /></ProtectedRoute>}>
        <Route index element={<JockeyDashboard />} />
        <Route path="invitations" element={<JockeyInvitations />} />
        <Route path="schedule" element={<JockeySchedule />} />
        <Route path="assignments" element={<JockeyAssignments />} />
        <Route path="results" element={<JockeyResults />} />
        <Route path="profile" element={<JockeyProfile />} />
      </Route>

      <Route path="/referee" element={<ProtectedRoute role="race_referee"><RefereeDashboard /></ProtectedRoute>} />
      <Route path="/referee/races" element={<ProtectedRoute role="race_referee"><RefereeRaces /></ProtectedRoute>} />
      <Route path="/referee/races/:raceId" element={<ProtectedRoute role="race_referee"><RefereeRaceDetail /></ProtectedRoute>} />
      <Route path="/referee/races/:raceId/horse-inspection" element={<ProtectedRoute role="race_referee"><HorseInspection /></ProtectedRoute>} />
      <Route path="/referee/races/:raceId/jockey-inspection" element={<ProtectedRoute role="race_referee"><JockeyInspection /></ProtectedRoute>} />
      <Route path="/referee/races/:raceId/monitor" element={<ProtectedRoute role="race_referee"><RaceMonitor /></ProtectedRoute>} />
      <Route path="/referee/races/:raceId/violations" element={<ProtectedRoute role="race_referee"><ViolationManagement /></ProtectedRoute>} />
      <Route path="/referee/races/:raceId/closure" element={<ProtectedRoute role="race_referee"><RaceClosure /></ProtectedRoute>} />

      <Route element={<ProtectedRoute role="spectator"><MainLayout /></ProtectedRoute>}>
        <Route path="/spectator" element={<SpectatorHome />} />
        <Route path="/spectator/tournaments" element={<TournamentList />} />
        <Route path="/spectator/tournaments/:tournamentId" element={<TournamentDetail />} />
        <Route path="/spectator/tournaments/:tournamentId/races/:raceId" element={<RaceDetail />} />
        <Route path="/spectator/predictions" element={<Predictions />} />
        <Route path="/spectator/predictions/history" element={<BetHistory />} />
        <Route path="/spectator/predictions/races/:raceId" element={<PredictionDetail />} />
        <Route path="/spectator/predictions/:tournamentId" element={<Navigate to="/spectator/predictions" replace />} />
        <Route path="/spectator/profile" element={<Profile />} />
        <Route path="/spectator/deposit" element={<Deposit />} />
        <Route path="/spectator/rewards" element={<Rewards />} />
        <Route path="/spectator/payment-success" element={<PaymentReturn />} />
        <Route path="/spectator/results" element={<Navigate to="/spectator/deposit" replace />} />
        <Route path="/spectator/role-applications" element={<RoleApplications />} />
      </Route>

      <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route path="/payment-success" element={<PaymentReturn />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
