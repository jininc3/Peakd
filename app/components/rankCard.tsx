import LeagueRankCard from './leagueRankCard';
import ValorantRankCard from './valorantRankCard';
import TftRankCard from './tftRankCard';

interface Game {
  id: number;
  name: string;
  rank: string;
  trophies: number;
  icon: string;
  wins: number;
  losses: number;
  winRate: number;
  recentMatches: string[];
  profileIconId?: number;
  // League-specific fields
  topChampions?: { championId: number; championLevel: number; championPoints: number }[];
  // Valorant-specific fields
  matchHistory?: { matchId: string; agent: string; kills: number; deaths: number; assists: number; won: boolean; map: string; gameStart: number; score: string; placement?: number }[];
  valorantCard?: string;
  peakRank?: { tier: string; season: string };
  gamesPlayed?: number;
  mmr?: number;
  accountLevel?: number;
  summonerLevel?: number;
  mostPlayedAgent?: string;
}

interface RankCardProps {
  game: Game;
  username: string;
  viewOnly?: boolean;
  userId?: string; // ID of the user whose stats to view (for viewing other users)
  isFocused?: boolean; // If true, card is in focused/unstacked mode and can be flipped
  isBackOfStack?: boolean; // If true, card is behind another card in the stack
  onRefresh?: () => void; // Callback when stats are refreshed
  initialFlipped?: boolean; // If true, show the back of the card initially
  flipOnly?: boolean; // If true, tapping only flips the card (no modal). Used on profile pages.
  onFlip?: () => void; // Callback when card is flipped to back for the first time
  autoReveal?: boolean; // If true, auto-animate flip to back on mount
}

export default function rankCard({ game, username, viewOnly = false, userId, isFocused = false, isBackOfStack = false, onRefresh, initialFlipped = false, flipOnly = false, onFlip, autoReveal = false }: RankCardProps) {
  // Route to the appropriate rank card based on game
  switch (game.name) {
    case 'Valorant':
      return <ValorantRankCard game={game} username={username} viewOnly={viewOnly} userId={userId} isFocused={isFocused} isBackOfStack={isBackOfStack} onRefresh={onRefresh} initialFlipped={initialFlipped} flipOnly={flipOnly} onFlip={onFlip} autoReveal={autoReveal} />;
    case 'TFT':
      return <TftRankCard game={game} username={username} viewOnly={viewOnly} userId={userId} />;
    case 'League of Legends':
    default:
      return <LeagueRankCard game={game} username={username} viewOnly={viewOnly} userId={userId} isFocused={isFocused} isBackOfStack={isBackOfStack} onRefresh={onRefresh} initialFlipped={initialFlipped} flipOnly={flipOnly} onFlip={onFlip} autoReveal={autoReveal} />;
  }
}
