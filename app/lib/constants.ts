import { PublicKey } from '@solana/web3.js'

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL
  || 'https://mainnet.helius-rpc.com/?api-key=e74081ed-6624-4d7b-9b49-9732a61b29ba'

export const FALLBACK_RPC_URL = 'https://api.mainnet-beta.solana.com'

export const IS_DEVNET = process.env.NEXT_PUBLIC_NETWORK === 'devnet'

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || '3vt5QCwqtn13ihaYoFk8RV7r7gbQMnbVcqSZdqNL6mKC'
)
export const TREASURY_SEED = Buffer.from('scratch_treasury_v2')
export const MONTHLY_PRIZE_SEED = Buffer.from('monthly_prize')
export const PROFILE_SEED = Buffer.from('scratch_profile')
export const GAME_CONFIG_SEED = Buffer.from('game_config')
export const MASTER_CONFIG_SEED = Buffer.from('master_config')

export const IDL = {
  version: "0.1.0",
  name: "seeker_scratch",
  instructions: [
    {
      name: "initialize",
      accounts: [
        { name: "treasury", isMut: true, isSigner: false },
        { name: "admin", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: []
    },
    {
      name: "fundTreasury",
      accounts: [
        { name: "treasury", isMut: true, isSigner: false },
        { name: "admin", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: [{ name: "amount", type: "u64" }]
    },
    {
      name: "registerReferral",
      accounts: [
        { name: "refereeProfile", isMut: true, isSigner: false },
        { name: "referee", isMut: true, isSigner: true },
        { name: "referrer", isMut: false, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: []
    },
    {
      name: "initializeMasterConfig",
      accounts: [
        { name: "masterConfig", isMut: true, isSigner: false },
        { name: "treasury", isMut: false, isSigner: false },
        { name: "admin", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: []
    },
    {
      name: "updateMasterConfig",
      accounts: [
        { name: "masterConfig", isMut: true, isSigner: false },
        { name: "treasury", isMut: false, isSigner: false },
        { name: "admin", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: [{ name: "args", type: { defined: "MasterConfigArgs" } }]
    },
    {
      name: "buyAndScratch",
      accounts: [
        { name: "treasury", isMut: true, isSigner: false },
        { name: "profile", isMut: true, isSigner: false },
        { name: "referrerProfile", isMut: true, isSigner: false },
        { name: "gameConfig", isMut: false, isSigner: false },
        { name: "masterConfig", isMut: false, isSigner: false },
        { name: "houseWallet", isMut: true, isSigner: false },
        { name: "player", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: [{ name: "cardType", type: { defined: "CardType" } }]
    },
    {
      name: "freeScratch",
      accounts: [
        { name: "treasury", isMut: false, isSigner: false },
        { name: "profile", isMut: true, isSigner: false },
        { name: "masterConfig", isMut: false, isSigner: false },
        { name: "player", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: []
    },
    {
      name: "updateProfile",
      accounts: [
        { name: "profile", isMut: true, isSigner: false },
        { name: "player", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: [
        { name: "name", type: { option: "string" } },
        { name: "pfpUrl", type: { option: "string" } }
      ]
    },
    {
      name: "creditReferrer",
      accounts: [
        { name: "referrerProfile", isMut: true, isSigner: false },
        { name: "referrerKey", isMut: false, isSigner: false },
        { name: "callerProfile", isMut: false, isSigner: false },
        { name: "caller", isMut: true, isSigner: true }
      ],
      args: []
    },
    {
      name: "setPaused",
      accounts: [
        { name: "treasury", isMut: true, isSigner: false },
        { name: "admin", isMut: true, isSigner: true }
      ],
      args: [{ name: "paused", type: "bool" }]
    },
    {
      name: "withdrawProfit",
      accounts: [
        { name: "treasury", isMut: true, isSigner: false },
        { name: "admin", isMut: true, isSigner: true }
      ],
      args: [{ name: "amount", type: "u64" }]
    },
    {
      name: "setMonthlyWinners",
      accounts: [
        { name: "monthlyPrize", isMut: true, isSigner: false },
        { name: "treasury", isMut: true, isSigner: false },
        { name: "admin", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: [
        { name: "winners", type: { array: ["publicKey", 3] } },
        { name: "amounts", type: { array: ["u64", 3] } }
      ]
    },
    {
      name: "claimMonthlyPrize",
      accounts: [
        { name: "monthlyPrize", isMut: true, isSigner: false },
        { name: "treasury", isMut: true, isSigner: false },
        { name: "claimant", isMut: true, isSigner: true }
      ],
      args: []
    },
    {
      name: "updateWinThresholds",
      accounts: [
        { name: "gameConfig", isMut: true, isSigner: false },
        { name: "treasury", isMut: false, isSigner: false },
        { name: "admin", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: [
        { name: "quickpick", type: "u16" },
        { name: "hotshot", type: "u16" },
        { name: "megagold", type: "u16" }
      ]
    },
    {
      name: "adminAdjustPoints",
      accounts: [
        { name: "playerProfile", isMut: true, isSigner: false },
        { name: "playerKey", isMut: false, isSigner: false },
        { name: "treasury", isMut: false, isSigner: false },
        { name: "admin", isMut: true, isSigner: true }
      ],
      args: [
        { name: "points", type: "u64" },
        { name: "addReferral", type: "bool" }
      ]
    },
    {
      name: "resetMonthlyPoints",
      accounts: [
        { name: "playerProfile", isMut: true, isSigner: false },
        { name: "playerKey", isMut: false, isSigner: false },
        { name: "treasury", isMut: false, isSigner: false },
        { name: "admin", isMut: true, isSigner: true }
      ],
      args: []
    },
    {
      name: "setMonthStart",
      accounts: [
        { name: "treasury", isMut: true, isSigner: false },
        { name: "admin", isMut: true, isSigner: true }
      ],
      args: []
    }
  ],
  accounts: [
    {
      name: "GameConfig",
      type: {
        kind: "struct",
        fields: [
          { name: "winThresholdQuickpick", type: "u16" },
          { name: "winThresholdHotshot", type: "u16" },
          { name: "winThresholdMegagold", type: "u16" },
          { name: "bump", type: "u8" }
        ]
      }
    },
    {
      name: "Treasury",
      type: {
        kind: "struct",
        fields: [
          { name: "admin", type: "publicKey" },
          { name: "balance", type: "u64" },
          { name: "totalCardsSold", type: "u64" },
          { name: "totalPaidOut", type: "u64" },
          { name: "totalProfit", type: "u64" },
          { name: "dailyPaidOut", type: "u64" },
          { name: "dayStartTime", type: "i64" },
          { name: "paused", type: "bool" },
          { name: "monthStart", type: "i64" },
          { name: "bump", type: "u8" }
        ]
      }
    },
    {
      name: "MonthlyPrize",
      type: {
        kind: "struct",
        fields: [
          { name: "month", type: "i64" },
          { name: "winners", type: { array: ["publicKey", 3] } },
          { name: "amounts", type: { array: ["u64", 3] } },
          { name: "paid", type: { array: ["bool", 3] } },
          { name: "bump", type: "u8" }
        ]
      }
    },
    {
      name: "PlayerProfile",
      type: {
        kind: "struct",
        fields: [
          { name: "owner", type: "publicKey" },
          { name: "displayName", type: "string" },
          { name: "pfpUrl", type: "string" },
          { name: "pointsThisMonth", type: "u64" },
          { name: "pointsAllTime", type: "u64" },
          { name: "cardsScratched", type: "u32" },
          { name: "totalSpent", type: "u64" },
          { name: "totalWon", type: "u64" },
          { name: "wins", type: "u32" },
          { name: "hasBeenReferred", type: "bool" },
          { name: "referredBy", type: "publicKey" },
          { name: "referralBonusPaid", type: "bool" },
          { name: "referralsCount", type: "u32" },
          { name: "lastWinSlot", type: "u64" },
          { name: "lastFreePlayTimestamp", type: "i64" },
          { name: "sweepPointsThisMonth", type: "u64" },
          { name: "sweepPointsAllTime", type: "u64" },
          { name: "freePlaysUsed", type: "u32" },
          { name: "freePlayWins", type: "u32" }
        ]
      }
    },
    {
      name: "MasterConfig",
      type: {
        kind: "struct",
        fields: [
          { name: "costQuickpick", type: "u64" },
          { name: "costHotshot", type: "u64" },
          { name: "costMegagold", type: "u64" },
          { name: "thresholdQuickpick", type: "u16" },
          { name: "thresholdHotshot", type: "u16" },
          { name: "thresholdMegagold", type: "u16" },
          { name: "houseFeeBps", type: "u64" },
          { name: "minTreasury", type: "u64" },
          { name: "dailyPayoutCap", type: "u64" },
          { name: "prize1stSol", type: "u64" },
          { name: "prize2ndSol", type: "u64" },
          { name: "prize3rdSol", type: "u64" },
          { name: "prize1stSkr", type: "u64" },
          { name: "prize2ndSkr", type: "u64" },
          { name: "prize3rdSkr", type: "u64" },
          { name: "sweep1stSkr", type: "u64" },
          { name: "sweep2ndSkr", type: "u64" },
          { name: "sweep3rdSkr", type: "u64" },
          { name: "freePlayCooldownSeconds", type: "i64" },
          { name: "quickpickEnabled", type: "bool" },
          { name: "hotshotEnabled", type: "bool" },
          { name: "megagoldEnabled", type: "bool" },
          { name: "doublePointsActive", type: "bool" },
          { name: "bannerText", type: "string" },
          { name: "bannerActive", type: "bool" },
          { name: "bump", type: "u8" }
        ]
      }
    }
  ],
  types: [
    {
      name: "CardType",
      type: {
        kind: "enum",
        variants: [
          { name: "QuickPick" },
          { name: "Lucky7s" },
          { name: "HotShot" },
          { name: "MegaGold" }
        ]
      }
    },
    {
      name: "MasterConfigArgs",
      type: {
        kind: "struct",
        fields: [
          { name: "costQuickpick", type: "u64" },
          { name: "costHotshot", type: "u64" },
          { name: "costMegagold", type: "u64" },
          { name: "thresholdQuickpick", type: "u16" },
          { name: "thresholdHotshot", type: "u16" },
          { name: "thresholdMegagold", type: "u16" },
          { name: "houseFeeBps", type: "u64" },
          { name: "minTreasury", type: "u64" },
          { name: "dailyPayoutCap", type: "u64" },
          { name: "prize1stSol", type: "u64" },
          { name: "prize2ndSol", type: "u64" },
          { name: "prize3rdSol", type: "u64" },
          { name: "prize1stSkr", type: "u64" },
          { name: "prize2ndSkr", type: "u64" },
          { name: "prize3rdSkr", type: "u64" },
          { name: "sweep1stSkr", type: "u64" },
          { name: "sweep2ndSkr", type: "u64" },
          { name: "sweep3rdSkr", type: "u64" },
          { name: "freePlayCooldownSeconds", type: "i64" },
          { name: "quickpickEnabled", type: "bool" },
          { name: "hotshotEnabled", type: "bool" },
          { name: "megagoldEnabled", type: "bool" },
          { name: "doublePointsActive", type: "bool" },
          { name: "bannerText", type: "string" },
          { name: "bannerActive", type: "bool" }
        ]
      }
    }
  ],
  errors: [
    { code: 6000, name: "GamePaused", msg: "Game is currently paused" },
    { code: 6001, name: "InvalidAmount", msg: "Invalid amount" },
    { code: 6002, name: "Overflow", msg: "Arithmetic overflow" },
    { code: 6003, name: "TreasuryTooLow", msg: "Treasury balance too low" },
    { code: 6004, name: "WithdrawWouldBreakMinimum", msg: "Withdraw would break minimum treasury requirement" },
    { code: 6005, name: "NameTooLong", msg: "Name too long (max 16 characters)" },
    { code: 6006, name: "PfpTooLong", msg: "PFP URL too long (max 128 characters)" },
    { code: 6007, name: "CannotReferSelf", msg: "Cannot refer yourself" },
    { code: 6008, name: "AlreadyReferred", msg: "Already been referred" },
    { code: 6009, name: "InvalidReferral", msg: "Invalid referral credit attempt" },
    { code: 6010, name: "InvalidInput", msg: "Invalid input" },
    { code: 6011, name: "NotAWinner", msg: "Not a monthly winner" },
    { code: 6012, name: "AlreadyClaimed", msg: "Prize already claimed" },
    { code: 6013, name: "CardDisabled", msg: "This card type is currently disabled" },
    { code: 6014, name: "FreePlayNotReady", msg: "Free play not available yet, come back later" }
  ]
}
