import { httpsCallable } from 'firebase/functions';
import { functions, auth } from '@/config/firebase';
import axios from 'axios';

// Types matching the Cloud Functions
export interface LinkAccountRequest {
  gameName: string;
  tagLine: string;
  region?: string;
}

export interface LinkAccountResponse {
  success: boolean;
  message: string;
  account?: {
    puuid: string;
    gameName: string;
    tagLine: string;
    region: string;
    linkedAt: any;
  };
}

export interface RiotStats {
  puuid: string;
  summonerLevel: number;
  profileIconId: number;
  rankedSolo?: {
    tier: string;
    rank: string;
    leaguePoints: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  topChampions: Array<{
    championId: number;
    championLevel: number;
    championPoints: number;
  }>;
  totalMasteryScore: number;
  lastUpdated: any;
  peakRank?: {
    tier: string;
    rank: string;
    season: string;
    achievedAt: any;
  };
}

export interface GetStatsResponse {
  success: boolean;
  message: string;
  stats?: RiotStats;
  cached?: boolean;
}

// TFT types
export interface TftStats {
  puuid: string;
  summonerLevel: number;
  profileIconId: number;
  rankedTft?: {
    tier: string;
    rank: string;
    leaguePoints: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  rankedDoubleUp?: {
    tier: string;
    rank: string;
    leaguePoints: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  lastUpdated: any;
  peakRank?: {
    tier: string;
    rank: string;
    season: string;
    achievedAt: any;
  };
}

export interface GetTftStatsResponse {
  success: boolean;
  message: string;
  stats?: TftStats;
  cached?: boolean;
}


export interface UnlinkAccountResponse {
  success: boolean;
  message: string;
}

// Recent matches types
export interface RecentMatchResult {
  won: boolean;
  // Valorant-specific fields
  agent?: string;
  kills?: number;
  deaths?: number;
  assists?: number;
  map?: string;
  score?: string;
  playedAt?: number; // Unix timestamp in milliseconds
  placement?: number; // Player's rank out of 10 by combat score
  // League-specific fields
  champion?: string;
  championId?: number;
}

export interface GetRecentMatchesRequest {
  targetUserId: string;
  game: 'league' | 'valorant';
}

export interface GetRecentMatchesResponse {
  success: boolean;
  matches: RecentMatchResult[];
  message?: string;
}

/**
 * Link a Riot account to the user's profile
 * @param gameName - Riot Game Name (e.g., "PlayerName")
 * @param tagLine - Riot Tag Line (e.g., "NA1")
 * @param region - Server region (default: "euw1")
 */
export const linkRiotAccount = async (
  gameName: string,
  tagLine: string,
  region: string = 'euw1'
): Promise<LinkAccountResponse> => {
  try {
    // Check if user is authenticated
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('You must be logged in to link a Riot account');
    }

    console.log('Current user UID:', currentUser.uid);
    console.log('Current user email:', currentUser.email);

    // Force refresh the ID token to ensure it's valid
    console.log('Getting fresh ID token...');
    const token = await currentUser.getIdToken(true);
    console.log('ID token obtained:', token ? 'Yes' : 'No');
    console.log('Token length:', token?.length);

    // Wait a bit to ensure the token is properly set in the Auth instance
    await new Promise(resolve => setTimeout(resolve, 500));

    // Use httpsCallable - Firebase SDK should automatically include auth
    const linkRiotAccountFn = httpsCallable<LinkAccountRequest, LinkAccountResponse>(
      functions,
      'linkRiotAccount'
    );

    console.log('Calling function with data:', { gameName, tagLine, region });
    const result = await linkRiotAccountFn({
      gameName,
      tagLine,
      region,
    });

    console.log('Function call successful');
    return result.data;
  } catch (error: any) {
    console.error('Error linking Riot account:', error);
    console.error('Error response:', error.response?.data);
    console.error('Error status:', error.response?.status);

    // Handle axios errors
    if (error.response) {
      const errorData = error.response.data;
      const errorMessage = errorData?.error?.message || errorData?.message || 'Failed to link Riot account';
      throw new Error(errorMessage);
    }

    // Provide more helpful error messages
    if (error.code === 'unauthenticated') {
      throw new Error('Authentication error. Please try logging out and back in.');
    }

    throw new Error(error.message || 'Failed to link Riot account');
  }
};

// Client-side League stats cache (30 min TTL)
const LEAGUE_STATS_CACHE_TTL = 30 * 60 * 1000;
let leagueStatsCache: { data: GetStatsResponse; timestamp: number } | null = null;

/**
 * Clear the client-side League stats cache
 */
export const clearLeagueStatsCache = () => {
  leagueStatsCache = null;
};

/**
 * Get League of Legends stats for the current user
 * @param forceRefresh - Force refresh data from Riot API (bypass cache)
 */
export const getLeagueStats = async (
  forceRefresh: boolean = false
): Promise<GetStatsResponse> => {
  try {
    // Return client cache if fresh and not forcing refresh
    if (!forceRefresh && leagueStatsCache && Date.now() - leagueStatsCache.timestamp < LEAGUE_STATS_CACHE_TTL) {
      return leagueStatsCache.data;
    }

    // Check if user is authenticated
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('You must be logged in to view League stats');
    }

    // Get fresh ID token to ensure authentication
    await currentUser.getIdToken(true);

    const getLeagueStatsFn = httpsCallable<{ forceRefresh?: boolean }, GetStatsResponse>(
      functions,
      'getLeagueStats'
    );

    const result = await getLeagueStatsFn({ forceRefresh });

    // Update client cache
    leagueStatsCache = { data: result.data, timestamp: Date.now() };

    return result.data;
  } catch (error: any) {
    // Return stale cache on error if available
    if (leagueStatsCache) {
      return leagueStatsCache.data;
    }

    // Provide more helpful error messages
    if (error.code === 'unauthenticated') {
      throw new Error('Authentication error. Please try logging out and back in.');
    }

    throw new Error(error.message || 'Failed to fetch League stats');
  }
};

/**
 * Get TFT stats for the current user
 * @param forceRefresh - Force refresh data from Riot API (bypass cache)
 */
export const getTftStats = async (
  forceRefresh: boolean = false
): Promise<GetTftStatsResponse> => {
  try {
    // Check if user is authenticated
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('You must be logged in to view TFT stats');
    }

    // Get fresh ID token to ensure authentication
    await currentUser.getIdToken(true);

    const getTftStatsFn = httpsCallable<{ forceRefresh?: boolean }, GetTftStatsResponse>(
      functions,
      'getTftStats'
    );

    const result = await getTftStatsFn({ forceRefresh });

    return result.data;
  } catch (error: any) {
    console.error('Error fetching TFT stats:', error);

    // Provide more helpful error messages
    if (error.code === 'unauthenticated') {
      throw new Error('Authentication error. Please try logging out and back in.');
    }

    throw new Error(error.message || 'Failed to fetch TFT stats');
  }
};


/**
 * Unlink the Riot account from the user's profile
 */
export const unlinkRiotAccount = async (): Promise<UnlinkAccountResponse> => {
  try {
    // Check if user is authenticated
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('You must be logged in to unlink a Riot account');
    }

    // Get fresh ID token to ensure authentication
    await currentUser.getIdToken(true);

    const unlinkRiotAccountFn = httpsCallable<void, UnlinkAccountResponse>(
      functions,
      'unlinkRiotAccount'
    );

    const result = await unlinkRiotAccountFn();

    return result.data;
  } catch (error: any) {
    console.error('Error unlinking Riot account:', error);

    // Provide more helpful error messages
    if (error.code === 'unauthenticated') {
      throw new Error('Authentication error. Please try logging out and back in.');
    }

    throw new Error(error.message || 'Failed to unlink Riot account');
  }
};

/**
 * Get the last 5 match results (win/loss) for a target user
 * @param targetUserId - The Firestore user ID of the player
 * @param game - 'league' or 'valorant'
 */
export const getRecentMatches = async (
  targetUserId: string,
  game: 'league' | 'valorant'
): Promise<GetRecentMatchesResponse> => {
  try {
    const getRecentMatchesFn = httpsCallable<GetRecentMatchesRequest, GetRecentMatchesResponse>(
      functions,
      'getRecentMatches'
    );

    const result = await getRecentMatchesFn({ targetUserId, game });
    return result.data;
  } catch (error: any) {
    console.error('Error fetching recent matches:', error);
    // Return empty gracefully so the UI doesn't break
    return { success: true, matches: [] };
  }
};

/**
 * Format rank display string
 * @param tier - Rank tier (e.g., "GOLD")
 * @param rank - Division (e.g., "II")
 */
export const formatRank = (tier: string, rank: string): string => {
  if (!tier || tier === 'UNRANKED') return 'Unranked';

  // Capitalize first letter, lowercase rest for tier
  const formattedTier = tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();

  // Master, Grandmaster, Challenger don't have divisions
  if (['Master', 'Grandmaster', 'Challenger'].includes(formattedTier)) {
    return formattedTier;
  }

  // If no rank (empty string), just return tier
  if (!rank) return formattedTier;

  return `${formattedTier} ${rank}`;
};


/**
 * Get profile icon URL from Data Dragon
 * @param profileIconId - Profile icon ID
 * @param version - League of Legends version (default: latest)
 */
export const getProfileIconUrl = (
  profileIconId: number,
  version: string = '14.24.1'
): string => {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${profileIconId}.png`;
};

/**
 * Get champion icon URL from Data Dragon
 * @param championId - Champion ID
 * @param version - League of Legends version (default: latest)
 */
/**
 * Map from champion ID to Data Dragon key (used in icon URLs)
 * Data Dragon keys remove spaces, apostrophes, dots and special chars
 */
const CHAMPION_DDRAGON_KEYS: { [key: number]: string } = {
  4: 'TwistedFate', 5: 'XinZhao', 7: 'Leblanc', 9: 'FiddleSticks',
  11: 'MasterYi', 20: 'Nunu', 21: 'MissFortune', 31: 'Chogath',
  36: 'DrMundo', 59: 'JarvanIV', 62: 'MonkeyKing', 64: 'LeeSin',
  69: 'Cassiopeia', 74: 'Heimerdinger', 76: 'Nidalee', 79: 'Gragas',
  82: 'Mordekaiser', 85: 'Kennen', 96: 'KogMaw', 103: 'Ahri',
  106: 'Volibear', 121: 'Khazix', 136: 'AurelionSol', 145: 'Kaisa',
  161: 'Velkoz', 200: 'Belveth', 223: 'TahmKench', 421: 'RekSai',
  497: 'Rakan', 498: 'Xayah', 518: 'Neeko', 526: 'Rell',
  888: 'RenataGlasc', 897: 'KSante',
};

export const getChampionIconUrl = (
  championId: number,
  version: string = '14.24.1'
): string => {
  const ddKey = CHAMPION_DDRAGON_KEYS[championId]
    || (CHAMPION_NAMES[championId] || `${championId}`).replace(/[\s'.]/g, '');
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${ddKey}.png`;
};

/**
 * Champion ID to Name mapping (top 20 most popular champions)
 * For a complete list, fetch from: https://ddragon.leagueoflegends.com/cdn/14.24.1/data/en_US/champion.json
 */
export const CHAMPION_NAMES: { [key: number]: string } = {
  1: 'Annie',
  2: 'Olaf',
  3: 'Galio',
  4: 'Twisted Fate',
  5: 'Xin Zhao',
  6: 'Urgot',
  7: 'LeBlanc',
  8: 'Vladimir',
  9: 'Fiddlesticks',
  10: 'Kayle',
  11: 'Master Yi',
  12: 'Alistar',
  13: 'Ryze',
  14: 'Sion',
  15: 'Sivir',
  16: 'Soraka',
  17: 'Teemo',
  18: 'Tristana',
  19: 'Warwick',
  20: 'Nunu',
  21: 'Miss Fortune',
  22: 'Ashe',
  23: 'Tryndamere',
  24: 'Jax',
  25: 'Morgana',
  26: 'Zilean',
  27: 'Singed',
  28: 'Evelynn',
  29: 'Twitch',
  30: 'Karthus',
  31: 'Cho\'Gath',
  32: 'Amumu',
  33: 'Rammus',
  34: 'Anivia',
  35: 'Shaco',
  36: 'Dr. Mundo',
  37: 'Sona',
  38: 'Kassadin',
  39: 'Irelia',
  40: 'Janna',
  41: 'Gangplank',
  42: 'Corki',
  43: 'Karma',
  44: 'Taric',
  45: 'Veigar',
  48: 'Trundle',
  50: 'Swain',
  51: 'Caitlyn',
  53: 'Blitzcrank',
  54: 'Malphite',
  55: 'Katarina',
  56: 'Nocturne',
  57: 'Maokai',
  58: 'Renekton',
  59: 'Jarvan IV',
  60: 'Elise',
  61: 'Orianna',
  62: 'Wukong',
  63: 'Brand',
  64: 'Lee Sin',
  67: 'Vayne',
  68: 'Rumble',
  69: 'Cassiopeia',
  72: 'Skarner',
  74: 'Heimerdinger',
  75: 'Nasus',
  76: 'Nidalee',
  77: 'Udyr',
  78: 'Poppy',
  79: 'Gragas',
  80: 'Pantheon',
  81: 'Ezreal',
  82: 'Mordekaiser',
  83: 'Yorick',
  84: 'Akali',
  85: 'Kennen',
  86: 'Garen',
  89: 'Leona',
  90: 'Malzahar',
  91: 'Talon',
  92: 'Riven',
  96: 'Kog\'Maw',
  98: 'Shen',
  99: 'Lux',
  101: 'Xerath',
  102: 'Shyvana',
  103: 'Ahri',
  104: 'Graves',
  105: 'Fizz',
  106: 'Volibear',
  107: 'Rengar',
  110: 'Varus',
  111: 'Nautilus',
  112: 'Viktor',
  113: 'Sejuani',
  114: 'Fiora',
  115: 'Ziggs',
  117: 'Lulu',
  119: 'Draven',
  120: 'Hecarim',
  121: 'Kha\'Zix',
  122: 'Darius',
  126: 'Jayce',
  127: 'Lissandra',
  131: 'Diana',
  133: 'Quinn',
  134: 'Syndra',
  136: 'Aurelion Sol',
  141: 'Kayn',
  142: 'Zoe',
  143: 'Zyra',
  145: 'Kai\'Sa',
  147: 'Seraphine',
  150: 'Gnar',
  154: 'Zac',
  157: 'Yasuo',
  161: 'Vel\'Koz',
  163: 'Taliyah',
  164: 'Camille',
  166: 'Akshan',
  200: 'Bel\'Veth',
  201: 'Braum',
  202: 'Jhin',
  203: 'Kindred',
  221: 'Zeri',
  222: 'Jinx',
  223: 'Tahm Kench',
  234: 'Viego',
  235: 'Senna',
  236: 'Lucian',
  238: 'Zed',
  240: 'Kled',
  245: 'Ekko',
  246: 'Qiyana',
  254: 'Vi',
  266: 'Aatrox',
  267: 'Nami',
  268: 'Azir',
  350: 'Yuumi',
  360: 'Samira',
  412: 'Thresh',
  420: 'Illaoi',
  421: 'Rek\'Sai',
  427: 'Ivern',
  429: 'Kalista',
  432: 'Bard',
  518: 'Neeko',
  523: 'Aphelios',
  526: 'Rell',
  555: 'Pyke',
  711: 'Vex',
  777: 'Yone',
  875: 'Sett',
  876: 'Lillia',
  887: 'Gwen',
  888: 'Renata Glasc',
  895: 'Nilah',
  897: 'K\'Sante',
  902: 'Milio',
  950: 'Naafiri',
  910: 'Hwei',
  233: 'Briar',
  901: 'Smolder',
};

/**
 * Get champion name by ID
 * @param championId - Champion ID
 */
export const getChampionName = (championId: number): string => {
  return CHAMPION_NAMES[championId] || `Champion ${championId}`;
};
