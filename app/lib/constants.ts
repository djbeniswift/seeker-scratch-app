import { PublicKey } from '@solana/web3.js'

export const PROGRAM_ID = new PublicKey('3vt5QCwqtn13ihaYoFk8RV7r7gbQMnbVcqSZdqNL6mKC')
export const TREASURY_SEED = Buffer.from('scratch_treasury')
export const PROFILE_SEED = Buffer.from('scratch_profile')

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
      name: "buyAndScratch",
      accounts: [
        { name: "treasury", isMut: true, isSigner: false },
        { name: "profile", isMut: true, isSigner: false },
        { name: "referrerProfile", isMut: true, isSigner: false },
        { name: "player", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false }
      ],
      args: [{ name: "cardType", type: { defined: "CardType" } }]
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
      name: "withdrawProfit",
      accounts: [
        { name: "treasury", isMut: true, isSigner: false },
        { name: "admin", isMut: true, isSigner: true }
      ],
      args: [{ name: "amount", type: "u64" }]
    }
  ],
  accounts: [
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
          { name: "referralsCount", type: "u32" }
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
    { code: 6008, name: "AlreadyReferred", msg: "Already been referred" }
  ]
}
