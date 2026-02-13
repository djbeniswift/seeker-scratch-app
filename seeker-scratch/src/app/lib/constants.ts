import { PublicKey } from '@solana/web3.js'

export const PROGRAM_ID = new PublicKey('D6xSi3CG6fK1Y8rgwzvPFob4paPRxebGgR3DW3MiCubf')

export const TREASURY_SEED = Buffer.from('scratch_treasury')
export const PROFILE_SEED = Buffer.from('scratch_profile')
export const NFT_SEED = Buffer.from('scratch_nft')

export const CARD_CONFIG = {
  QuickPick: {
    name: 'QUICK PICK',
    emoji: '⚡',
    cost: 0.01,
    costLabel: '0.01 SOL',
    topPrize: '0.5 SOL',
    odds: '1 in 4',
    color: 'cyan',
    accentColor: '#00d4ff',
    btnClass: 'btn-cyan',
    subtitle: 'Micro stakes, instant fun',
  },
  Lucky7s: {
    name: 'LUCKY 7S',
    emoji: '🍀',
    cost: 0.05,
    costLabel: '0.05 SOL',
    topPrize: '2 SOL',
    odds: '1 in 3',
    color: 'purple',
    accentColor: '#a855f7',
    btnClass: 'btn-purple',
    subtitle: 'Triple 7 = jackpot',
  },
  HotShot: {
    name: 'HOT SHOT',
    emoji: '🔥',
    cost: 0.05,
    costLabel: '0.05 SOL',
    topPrize: '5 SOL',
    odds: '1 in 4',
    color: 'red',
    accentColor: '#ff4444',
    btnClass: 'btn-red',
    subtitle: 'High risk, high reward',
  },
  MegaGold: {
    name: 'MEGA GOLD',
    emoji: '👑',
    cost: 0.1,
    costLabel: '0.1 SOL',
    topPrize: '10 SOL',
    odds: '1 in 3',
    color: 'gold',
    accentColor: '#f5c842',
    btnClass: 'btn-gold',
    subtitle: 'Highest jackpot on Seeker',
  },
}

export const NFT_TIERS = {
  Silver: { cost: '0.1', multiplier: 2, emoji: '🥈', color: '#c0c0c0' },
  Gold: { cost: '0.5', multiplier: 5, emoji: '🥇', color: '#ffd700' },
  Platinum: { cost: '2', multiplier: 10, emoji: '💎', color: '#e5e4e2' },
  Diamond: { cost: '5', multiplier: 20, emoji: '👑', color: '#b9f2ff' },
}

export const IDL = {
  version: '0.1.0',
  name: 'seeker_scratch',
  instructions: [
    {
      name: 'initialize',
      accounts: [
        { name: 'treasury', isMut: true, isSigner: false },
        { name: 'admin', isMut: true, isSigner: true },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: 'fundTreasury',
      accounts: [
        { name: 'treasury', isMut: true, isSigner: false },
        { name: 'admin', isMut: true, isSigner: true },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'amount', type: 'u64' }],
    },
    {
      name: 'buyAndScratch',
      accounts: [
        { name: 'treasury', isMut: true, isSigner: false },
        { name: 'profile', isMut: true, isSigner: false },
        { name: 'player', isMut: true, isSigner: true },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'cardType', type: { defined: 'CardType' } }],
    },
    {
      name: 'updateProfile',
      accounts: [
        { name: 'profile', isMut: true, isSigner: false },
        { name: 'player', isMut: true, isSigner: true },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [
        { name: 'name', type: { option: 'string' } },
        { name: 'pfpUrl', type: { option: 'string' } },
      ],
    },
    {
      name: 'registerReferral',
      accounts: [
        { name: 'refereeProfile', isMut: true, isSigner: false },
        { name: 'referrerProfile', isMut: true, isSigner: false },
        { name: 'referrer', isMut: false, isSigner: false },
        { name: 'referee', isMut: true, isSigner: true },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: 'mintBonusNft',
      accounts: [
        { name: 'treasury', isMut: true, isSigner: false },
        { name: 'bonusNft', isMut: true, isSigner: false },
        { name: 'profile', isMut: true, isSigner: false },
        { name: 'player', isMut: true, isSigner: true },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [{ name: 'tier', type: { defined: 'NFTTier' } }],
    },
  ],
  accounts: [
    {
      name: 'Treasury',
      type: {
        kind: 'struct',
        fields: [
          { name: 'admin', type: 'publicKey' },
          { name: 'balance', type: 'u64' },
          { name: 'totalCardsSold', type: 'u64' },
          { name: 'totalPaidOut', type: 'u64' },
          { name: 'totalProfit', type: 'u64' },
          { name: 'dailyPaidOut', type: 'u64' },
          { name: 'dayStartTime', type: 'i64' },
          { name: 'paused', type: 'bool' },
          { name: 'bump', type: 'u8' },
        ],
      },
    },
    {
      name: 'PlayerProfile',
      type: {
        kind: 'struct',
        fields: [
          { name: 'owner', type: 'publicKey' },
          { name: 'displayName', type: 'string' },
          { name: 'pfpUrl', type: 'string' },
          { name: 'pointsThisMonth', type: 'u64' },
          { name: 'pointsAllTime', type: 'u64' },
          { name: 'referralsCount', type: 'u32' },
          { name: 'cardsScratched', type: 'u32' },
          { name: 'totalSpent', type: 'u64' },
          { name: 'totalWon', type: 'u64' },
          { name: 'wins', type: 'u32' },
          { name: 'bonusNft', type: { option: 'publicKey' } },
          { name: 'nftMultiplierCache', type: 'u8' },
          { name: 'referredBy', type: { option: 'publicKey' } },
          { name: 'firstPurchaseTime', type: 'i64' },
        ],
      },
    },
    {
      name: 'BonusNFT',
      type: {
        kind: 'struct',
        fields: [
          { name: 'owner', type: 'publicKey' },
          { name: 'tier', type: { defined: 'NFTTier' } },
          { name: 'multiplier', type: 'u8' },
          { name: 'mintDate', type: 'i64' },
          { name: 'totalPointsEarned', type: 'u64' },
          { name: 'bump', type: 'u8' },
        ],
      },
    },
  ],
  types: [
    {
      name: 'CardType',
      type: {
        kind: 'enum',
        variants: [
          { name: 'QuickPick' },
          { name: 'Lucky7s' },
          { name: 'HotShot' },
          { name: 'MegaGold' },
        ],
      },
    },
    {
      name: 'NFTTier',
      type: {
        kind: 'enum',
        variants: [
          { name: 'Silver' },
          { name: 'Gold' },
          { name: 'Platinum' },
          { name: 'Diamond' },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: 'GamePaused', msg: 'Game is currently paused' },
    { code: 6001, name: 'InvalidAmount', msg: 'Invalid amount' },
    { code: 6002, name: 'Overflow', msg: 'Arithmetic overflow' },
    { code: 6003, name: 'Unauthorized', msg: 'Unauthorized - admin only' },
    { code: 6004, name: 'TreasuryTooLow', msg: 'Treasury balance too low for this card type' },
    { code: 6005, name: 'InsufficientTreasury', msg: 'Treasury has insufficient funds for payout' },
    { code: 6006, name: 'WithdrawWouldBreakMinimum', msg: 'Withdraw would break minimum treasury requirement' },
    { code: 6007, name: 'AlreadyReferred', msg: 'This wallet has already been referred' },
    { code: 6008, name: 'CannotSelfRefer', msg: 'Cannot refer yourself' },
    { code: 6009, name: 'ReferralNotQualified', msg: "Referee hasn't met 0.1 SOL minimum spend" },
    { code: 6010, name: 'AlreadyHasNFT', msg: 'Player already owns a Bonus NFT' },
    { code: 6011, name: 'NameTooLong', msg: 'Name too long (max 16 characters)' },
    { code: 6012, name: 'InvalidName', msg: 'Invalid name (alphanumeric, spaces, underscores only)' },
    { code: 6013, name: 'PfpTooLong', msg: 'PFP URL too long (max 128 characters)' },
  ],
}