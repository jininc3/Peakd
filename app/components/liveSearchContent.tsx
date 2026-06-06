import DuoSearchingAnimation from '@/app/components/duoSearchingAnimation';
import DuoMatchResult from '@/app/components/duoMatchResult';
import DuoAcceptScreen from '@/app/components/duoAcceptScreen';
import DuoCardDetailModal from '@/app/components/duoCardProfile';
import LiveSearchIdle from '@/app/components/liveSearchIdle';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, StyleSheet, View, ScrollView, AppState } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useRouter } from '@/hooks/useRouter';
import { joinDuoQueue, leaveDuoQueue, subscribeToDuoQueue, getDuoMatch, acceptMatch, declineMatch, subscribeToMatch, DuoMatchCardData, DuoMatch } from '@/services/duoMatchService';
import { createOrGetChat, sendMessage } from '@/services/chatService';
import { DuoCardData } from '@/app/(tabs)/duoFinder';

interface LiveSearchContentProps {
  valorantCard: DuoCardData | null;
  leagueCard: DuoCardData | null;
  valorantInGameIcon?: string;
  valorantInGameName?: string;
  leagueInGameIcon?: string;
  leagueInGameName?: string;
  valorantWinRate?: number;
  valorantGamesPlayed?: number;
  leagueWinRate?: number;
  leagueGamesPlayed?: number;
  onMatchStateChange?: (state: 'idle' | 'searching' | 'accepting' | 'matched') => void;
}

export default function LiveSearchContent({
  valorantCard,
  leagueCard,
  valorantInGameIcon,
  valorantInGameName,
  leagueInGameIcon,
  leagueInGameName,
  valorantWinRate,
  valorantGamesPlayed,
  leagueWinRate,
  leagueGamesPlayed,
  onMatchStateChange,
}: LiveSearchContentProps) {
  const { user } = useAuth();
  const router = useRouter();

  const [showDuoProfile, setShowDuoProfile] = useState(false);

  // Live search state
  const [matchState, setMatchStateInternal] = useState<'idle' | 'searching' | 'accepting' | 'matched'>('idle');
  const setMatchState = useCallback((state: 'idle' | 'searching' | 'accepting' | 'matched') => {
    setMatchStateInternal(state);
    onMatchStateChange?.(state);
  }, [onMatchStateChange]);
  const [searchGame, setSearchGame] = useState<'valorant' | 'league' | null>(null);
  const [searchGamePick, setSearchGamePick] = useState<'valorant' | 'league' | null>(null);
  const [searchModePick, setSearchModePick] = useState<'lfg' | 'duo' | null>('lfg');
  const [searchMode, setSearchMode] = useState<'lfg' | 'duo' | null>(null);
  const [matchedUserCard, setMatchedUserCard] = useState<DuoMatchCardData | null>(null);
  const [matchedUserId, setMatchedUserId] = useState<string | null>(null);
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);
  const [matchExpiresAt, setMatchExpiresAt] = useState<Date | null>(null);
  const [hasAccepted, setHasAccepted] = useState(false);
  const [otherAccepted, setOtherAccepted] = useState(false);
  const unsubscribeQueueRef = useRef<(() => void) | null>(null);
  const unsubscribeMatchRef = useRef<(() => void) | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acceptPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCardDataRef = useRef<{ username: string; avatar?: string; inGameIcon?: string; inGameName?: string; currentRank?: string; mainRole?: string; mainAgent?: string } | null>(null);

  const hasCards = valorantCard !== null || leagueCard !== null;

  const acceptPollCleanup = useCallback(() => {
    if (acceptPollRef.current) {
      clearInterval(acceptPollRef.current);
      acceptPollRef.current = null;
    }
  }, []);

  const cleanupSearch = useCallback(() => {
    if (unsubscribeQueueRef.current) {
      unsubscribeQueueRef.current();
      unsubscribeQueueRef.current = null;
    }
    if (unsubscribeMatchRef.current) {
      unsubscribeMatchRef.current();
      unsubscribeMatchRef.current = null;
    }
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    acceptPollCleanup();
  }, []);

  const startLiveSearch = async (game: 'valorant' | 'league', mode: 'lfg' | 'duo' = 'duo') => {
    if (!user?.id) return;

    const cardData = game === 'valorant' ? valorantCard : leagueCard;
    if (!cardData) return;

    setSearchGame(game);
    setSearchMode(mode);
    setMatchState('searching');
    setMatchedUserCard(null);
    setMatchedUserId(null);
    setCurrentMatchId(null);
    setHasAccepted(false);
    setOtherAccepted(false);

    const inGameIcon = game === 'valorant' ? valorantInGameIcon : leagueInGameIcon;
    const inGameName = game === 'valorant' ? valorantInGameName : leagueInGameName;

    const queueCardData = {
      username: cardData.username,
      avatar: user.avatar || undefined,
      inGameIcon,
      inGameName,
      currentRank: cardData.currentRank,
      mainRole: cardData.mainRole,
      mainAgent: cardData.mainAgent,
    };
    lastCardDataRef.current = queueCardData;

    try {
      await joinDuoQueue(user.id, game, mode, queueCardData);

      const unsubscribe = subscribeToDuoQueue(user.id, game, async (data) => {
        if (data?.status === 'matched' && data.matchId) {
          if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
            searchTimeoutRef.current = null;
          }
          if (unsubscribeQueueRef.current) {
            unsubscribeQueueRef.current();
            unsubscribeQueueRef.current = null;
          }

          const match = await getDuoMatch(data.matchId);
          if (match) {
            const otherCard = match.user1Id === user.id ? match.user2Card : match.user1Card;
            setMatchedUserCard(otherCard);
            setMatchedUserId(match.user1Id === user.id ? match.user2Id : match.user1Id);
            setCurrentMatchId(data.matchId);
            setMatchExpiresAt(match.expiresAt?.toDate ? match.expiresAt.toDate() : new Date(Date.now() + 30000));
            setHasAccepted(false);
            setOtherAccepted(false);
            setMatchState('accepting');

            const matchUnsub = subscribeToMatch(data.matchId, (updatedMatch) => {
              if (!updatedMatch) return;

              const isUser1 = updatedMatch.user1Id === user.id;
              const myAccepted = isUser1 ? updatedMatch.user1Accepted : updatedMatch.user2Accepted;
              const theirAccepted = isUser1 ? updatedMatch.user2Accepted : updatedMatch.user1Accepted;

              setHasAccepted(myAccepted === true);
              setOtherAccepted(theirAccepted === true);

              if (updatedMatch.status === 'active' || (myAccepted === true && theirAccepted === true)) {
                if (unsubscribeMatchRef.current) {
                  unsubscribeMatchRef.current();
                  unsubscribeMatchRef.current = null;
                }
                setMatchState('matched');
              } else if (updatedMatch.status === 'declined' || updatedMatch.status === 'expired') {
                if (unsubscribeMatchRef.current) {
                  unsubscribeMatchRef.current();
                  unsubscribeMatchRef.current = null;
                }

                if (theirAccepted === 'declined' && myAccepted !== 'declined') {
                  setMatchState('searching');
                  setMatchedUserCard(null);
                  setCurrentMatchId(null);

                  const requeueUnsub = subscribeToDuoQueue(user.id!, game, async (requeueData) => {
                    if (requeueData?.status === 'matched' && requeueData.matchId) {
                      if (unsubscribeQueueRef.current) {
                        unsubscribeQueueRef.current();
                        unsubscribeQueueRef.current = null;
                      }
                      if (searchTimeoutRef.current) {
                        clearTimeout(searchTimeoutRef.current);
                        searchTimeoutRef.current = null;
                      }
                      const newMatch = await getDuoMatch(requeueData.matchId);
                      if (newMatch) {
                        const newOtherCard = newMatch.user1Id === user.id ? newMatch.user2Card : newMatch.user1Card;
                        setMatchedUserCard(newOtherCard);
                        setMatchedUserId(newMatch.user1Id === user.id ? newMatch.user2Id : newMatch.user1Id);
                        setCurrentMatchId(requeueData.matchId);
                        setMatchExpiresAt(newMatch.expiresAt?.toDate ? newMatch.expiresAt.toDate() : new Date(Date.now() + 30000));
                        setHasAccepted(false);
                        setOtherAccepted(false);
                        setMatchState('accepting');

                        const newMatchUnsub = subscribeToMatch(requeueData.matchId, (updatedNewMatch) => {
                          if (!updatedNewMatch) return;

                          const isUser1 = updatedNewMatch.user1Id === user.id;
                          const myAcc = isUser1 ? updatedNewMatch.user1Accepted : updatedNewMatch.user2Accepted;
                          const theirAcc = isUser1 ? updatedNewMatch.user2Accepted : updatedNewMatch.user1Accepted;

                          setHasAccepted(myAcc === true);
                          setOtherAccepted(theirAcc === true);

                          if (updatedNewMatch.status === 'active' || (myAcc === true && theirAcc === true)) {
                            if (unsubscribeMatchRef.current) {
                              unsubscribeMatchRef.current();
                              unsubscribeMatchRef.current = null;
                            }
                            setMatchState('matched');
                          } else if (updatedNewMatch.status === 'declined' || updatedNewMatch.status === 'expired') {
                            if (unsubscribeMatchRef.current) {
                              unsubscribeMatchRef.current();
                              unsubscribeMatchRef.current = null;
                            }
                            setMatchedUserCard(null);
                            setCurrentMatchId(null);
                            if (game && mode) {
                              startLiveSearch(game, mode);
                            } else {
                              setMatchState('idle');
                              setSearchGame(null);
                              setSearchMode(null);
                            }
                          }
                        });
                        unsubscribeMatchRef.current = newMatchUnsub;
                      }
                    }
                  });
                  unsubscribeQueueRef.current = requeueUnsub;

                  searchTimeoutRef.current = setTimeout(() => {
                    cleanupSearch();
                    if (user?.id) {
                      leaveDuoQueue(user.id, game).then(() => {
                        startLiveSearch(game, mode);
                      });
                    }
                  }, 30000);
                } else {
                  setMatchedUserCard(null);
                  setCurrentMatchId(null);
                  if (game && mode) {
                    startLiveSearch(game, mode);
                  } else {
                    setMatchState('idle');
                    setSearchGame(null);
                    setSearchMode(null);
                  }
                }
              }
            });
            unsubscribeMatchRef.current = matchUnsub;
          }
        }
      });
      unsubscribeQueueRef.current = unsubscribe;

      searchTimeoutRef.current = setTimeout(() => {
        cleanupSearch();
        if (user?.id) {
          leaveDuoQueue(user.id, game).then(() => {
            startLiveSearch(game, mode);
          });
        }
      }, 30000);
    } catch (error) {
      console.error('Error starting live search:', error);
      setMatchState('idle');
      setSearchGame(null);
      setSearchMode(null);
      Alert.alert('Error', 'Failed to start searching. Please try again.');
    }
  };

  const cancelSearch = useCallback(() => {
    cleanupSearch();
    if (user?.id && searchGame) {
      leaveDuoQueue(user.id, searchGame);
    }
    setMatchState('idle');
    setSearchGame(null);
    setSearchMode(null);
  }, [user?.id, searchGame, cleanupSearch]);

  const handleAccept = async () => {
    if (!currentMatchId || !user?.id) return;
    setHasAccepted(true);
    try {
      await acceptMatch(currentMatchId, user.id);

      // Poll as fallback in case the snapshot listener misses the update
      if (acceptPollRef.current) clearInterval(acceptPollRef.current);
      const matchId = currentMatchId;
      acceptPollRef.current = setInterval(async () => {
        try {
          const match = await getDuoMatch(matchId);
          if (!match) {
            if (acceptPollRef.current) clearInterval(acceptPollRef.current);
            return;
          }
          const isUser1 = match.user1Id === user.id;
          const theirAccepted = isUser1 ? match.user2Accepted : match.user1Accepted;
          if (match.status === 'active' || theirAccepted === true) {
            if (acceptPollRef.current) clearInterval(acceptPollRef.current);
            if (unsubscribeMatchRef.current) {
              unsubscribeMatchRef.current();
              unsubscribeMatchRef.current = null;
            }
            setOtherAccepted(true);
            setMatchState('matched');
          }
        } catch (e) {
          console.error('Error polling match:', e);
        }
      }, 2000);
    } catch (error) {
      console.error('Error accepting match:', error);
    }
  };

  const handleDecline = async () => {
    if (!currentMatchId || !user?.id) return;
    try {
      await declineMatch(currentMatchId, user.id);
    } catch (error) {
      console.error('Error declining match:', error);
    }
    cleanupSearch();
    setMatchState('idle');
    setSearchGame(null);
    setSearchMode(null);
    setMatchedUserCard(null);
    setMatchedUserId(null);
    setCurrentMatchId(null);
  };

  const handleAcceptTimeout = async () => {
    if (!currentMatchId || !user?.id) return;
    try {
      await declineMatch(currentMatchId, user.id);
    } catch (error) {
      console.error('Error on timeout decline:', error);
    }
    cleanupSearch();
    setMatchedUserCard(null);
    setMatchedUserId(null);
    setCurrentMatchId(null);
    if (searchGame && searchMode) {
      startLiveSearch(searchGame, searchMode);
    } else {
      setMatchState('idle');
      setSearchGame(null);
      setSearchMode(null);
    }
  };

  const handleSearchAgain = () => {
    if (searchGame && searchMode) {
      setMatchState('idle');
      setMatchedUserCard(null);
      setMatchedUserId(null);
      setCurrentMatchId(null);
      setTimeout(() => startLiveSearch(searchGame, searchMode), 300);
    }
  };

  const handleMatchViewProfile = () => {
    if (!matchedUserCard) return;
    setShowDuoProfile(true);
  };

  const handleAutoNavigateToChat = async () => {
    if (!user?.id || !matchedUserCard || !searchGame) return;

    const myInGameName = searchGame === 'valorant' ? valorantInGameName : leagueInGameName;
    const gameLabel = searchGame === 'valorant' ? 'Valorant' : 'League';

    try {
      const chatId = await createOrGetChat(
        user.id,
        user.username || '',
        user.avatar,
        matchedUserCard.userId,
        matchedUserCard.username,
        matchedUserCard.avatar || undefined,
      );

      if (myInGameName) {
        await sendMessage(
          chatId,
          user.id,
          `My ${gameLabel} username: ${myInGameName}`,
          'game_username',
          undefined,
          { game: searchGame, inGameName: myInGameName }
        );
      }

      router.replace({
        pathname: '/chatPages/chatScreen',
        params: {
          chatId,
          otherUserId: matchedUserCard.userId,
          otherUsername: matchedUserCard.username,
          otherUserAvatar: matchedUserCard.avatar || '',
        },
      });
    } catch (error) {
      console.error('Error auto-navigating to chat:', error);
      router.replace({
        pathname: '/chatPages/chatScreen',
        params: {
          otherUserId: matchedUserCard.userId,
          otherUsername: matchedUserCard.username,
          otherUserAvatar: matchedUserCard.avatar || '',
        },
      });
    }
  };

  // Auto-decline when accept timer expires
  useEffect(() => {
    if (matchState !== 'accepting' || !matchExpiresAt || hasAccepted) return;

    const checkExpiry = setInterval(() => {
      if (new Date() >= matchExpiresAt) {
        clearInterval(checkExpiry);
        handleAcceptTimeout();
      }
    }, 500);

    return () => clearInterval(checkExpiry);
  }, [matchState, matchExpiresAt, hasAccepted]);

  // Cleanup on unmount or app background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState !== 'active' && matchState === 'searching') {
        cancelSearch();
      }
    });

    return () => {
      subscription.remove();
      cleanupSearch();
      if (user?.id && searchGame && matchState === 'searching') {
        leaveDuoQueue(user.id, searchGame);
      }
    };
  }, [matchState, searchGame, user?.id]);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={{ overflow: 'visible' }}
      >
        {matchState === 'searching' && searchGame ? (
          <DuoSearchingAnimation
            game={searchGame}
            onCancel={cancelSearch}
            currentRank={lastCardDataRef.current?.currentRank}
            mainRole={lastCardDataRef.current?.mainRole}
            region={searchGame === 'valorant' ? valorantCard?.region : leagueCard?.region}
          />
        ) : matchState === 'accepting' && matchedUserCard && searchGame && matchExpiresAt ? (
          <DuoAcceptScreen
            matchedUser={matchedUserCard}
            game={searchGame}
            expiresAt={matchExpiresAt}
            hasAccepted={hasAccepted}
            otherAccepted={otherAccepted}
            onAccept={handleAccept}
            onDecline={handleDecline}
            onViewProfile={() => setShowDuoProfile(true)}
          />
        ) : matchState === 'matched' && matchedUserCard && searchGame ? (
          <DuoMatchResult
            game={searchGame}
            matchedUser={matchedUserCard}
            myInGameName={searchGame === 'valorant' ? valorantInGameName : leagueInGameName}
            onAutoNavigate={handleAutoNavigateToChat}
            onViewProfile={handleMatchViewProfile}
            onSearchAgain={handleSearchAgain}
          />
        ) : (
          <LiveSearchIdle
            hasCards={hasCards}
            valorantCard={valorantCard}
            leagueCard={leagueCard}
            searchModePick={searchModePick}
            onPickMode={(mode) => setSearchModePick(mode)}
            searchGamePick={searchGamePick}
            onPickGame={(game) => setSearchGamePick(game)}
            onSearch={() => searchGamePick && searchModePick && startLiveSearch(searchGamePick, searchModePick)}
            onCreateCard={() => router.push('/profilePages/rankCards')}
            valorantInGameName={valorantInGameName}
            leagueInGameName={leagueInGameName}
            valorantInGameIcon={valorantInGameIcon}
            leagueInGameIcon={leagueInGameIcon}
            username={user?.username}
            avatar={user?.avatar}
            valorantWinRate={valorantWinRate}
            valorantGamesPlayed={valorantGamesPlayed}
            leagueWinRate={leagueWinRate}
            leagueGamesPlayed={leagueGamesPlayed}
          />
        )}
      </ScrollView>

      <DuoCardDetailModal
        visible={showDuoProfile}
        onClose={() => setShowDuoProfile(false)}
        expiresAt={matchState === 'accepting' && matchExpiresAt ? matchExpiresAt : undefined}
        card={matchedUserCard && searchGame ? {
          game: searchGame,
          username: matchedUserCard.username,
          avatar: matchedUserCard.avatar || undefined,
          inGameIcon: matchedUserCard.inGameIcon || undefined,
          inGameName: matchedUserCard.inGameName || undefined,
          currentRank: matchedUserCard.currentRank || 'Unranked',
          peakRank: '',
          mainRole: matchedUserCard.mainRole || '',
          mainAgent: matchedUserCard.mainAgent || undefined,
          userId: matchedUserCard.userId,
        } : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'visible',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    justifyContent: 'center',
  },
});
