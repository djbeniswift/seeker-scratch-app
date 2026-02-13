# Referral System Fix Summary

## Problem Identified ❌
The referral system was only completing 2 out of 3 required steps:
1. ✅ Registration (storing referral relationship)
2. ✅ Qualification detection (emitting event when 0.1 SOL spent)
3. ❌ **Points awarding (NEVER HAPPENED)**

The smart contract emits a `ReferralQualified` event but doesn't automatically award points. A separate `award_referral_points` instruction must be called.

## Solution Implemented ✅

### New Files Created:
1. **`src/app/hooks/useReferralMonitor.ts`** - Event listener hook that:
   - Listens for `ReferralQualified` events from the smart contract
   - Automatically calls `awardReferralPoints()` when detected
   - Prevents duplicate awarding with a processed set
   - Logs all activity to console for debugging

### Files Modified:
1. **`src/app/lib/constants.ts`**
   - Added `awardReferralPoints` instruction to IDL

2. **`src/app/page.tsx`**
   - Imported and initialized `useReferralMonitor()` hook
   - Added "Referred Bonus" stat to Your Stats section (shows ✅ 10 pts in green)

## How It Works Now

### Complete Flow:
1. User clicks referral link: `?ref=WALLET_ADDRESS`
2. On connect, `registerReferral` is called → stores relationship
3. When referee spends 0.1 SOL, smart contract emits `ReferralQualified`
4. **NEW:** `useReferralMonitor` detects event and calls `awardReferralPoints`
5. Both parties receive points instantly

### Points Distribution:
- **Referrer:** 100 points × NFT multiplier (2x, 5x, 10x, or 20x)
- **Referee:** 100 points flat
- **Referrer's count:** `referralsCount` increments by 1

### UI Changes:
- Added "Referred Bonus" row in Your Stats
- Shows `✅ 100 pts` in green if user was referred
- Shows `N/A` if user wasn't referred
- Makes it clear users got a 100-point bonus for being referred

---

# 🔧 Testing Guide

## Setup: Two Wallets Needed

You'll need two separate wallets to test:
- **Wallet A** (Referrer) - Your main wallet
- **Wallet B** (Referee) - A test wallet (create new in Phantom)

## Test Scenario:

1. **Get Your Referral Link (Wallet A)**
   ```
   https://seekerscratch.vercel.app?ref=YOUR_WALLET_A_ADDRESS
   ```

2. **Open in Incognito/Private Browser**
   - Open the referral link in incognito mode
   - Connect Wallet B (make sure it has ~0.15 SOL for testing)

3. **Check Registration**
   - Open browser console (F12)
   - You should see: `👀 Starting referral monitor...`
   - Connect Wallet B
   - Referral should register automatically (check Profile tab)

4. **Trigger Qualification**
   - Buy scratch cards with Wallet B until total spent ≥ 0.1 SOL
   - Options:
     - 10x QuickPick (0.01 SOL each) = 0.1 SOL
     - 2x Lucky7s (0.05 SOL each) = 0.1 SOL
     - 1x MegaGold (0.1 SOL) = 0.1 SOL

5. **Watch Console for Event**
   ```
   🎉 ReferralQualified event detected!
      Referrer: [YOUR_WALLET_A]
      Referee: [WALLET_B]
   🎁 Awarding referral points...
   ✅ Referral points awarded! Tx: [transaction_id]
   ```

6. **Verify Points Awarded**
   - Switch back to Wallet A
   - Check Profile → Your Stats
   - `Referrals` should be: `1`
   - `Points (Month)` should increase by `100` (or `100 × NFT multiplier`)
   
   - Wallet B should show:
     - `Referred Bonus`: `✅ 100 pts` (in green)
     - `Points (Month)`: `100` (plus points from scratching)

---

## Debugging Tips

### If Referral Doesn't Register:
- Check browser console for errors
- Verify `?ref=` parameter is in URL
- Make sure Wallet B hasn't been referred before (check Profile tab)
- Try refreshing the page after connecting

### If Points Aren't Awarded:
- Check browser console for `ReferralQualified` event
- Verify Wallet B actually spent ≥ 0.1 SOL (check Profile → Total Spent)
- Look for error messages in console
- Check Solana Explorer for the `awardReferralPoints` transaction

### If Monitor Isn't Running:
- Refresh the page
- Check console for `👀 Starting referral monitor...`
- Make sure you're not in an error state (wallet disconnected, etc.)

---

## Console Logs to Watch For

### Good Signs ✅
```
👀 Starting referral monitor...
🎉 ReferralQualified event detected!
🎁 Awarding referral points...
✅ Referral points awarded! Tx: ABC123...
```

### Bad Signs ❌
```
❌ No program available for awarding points
❌ Failed to award referral points: [error]
⏭️ Already processed this qualification, skipping
```

---

## Testing Checklist

- [ ] Create/fund test Wallet B with 0.15 SOL
- [ ] Generate referral link with Wallet A address
- [ ] Open referral link in incognito with Wallet B
- [ ] Verify console shows "Starting referral monitor"
- [ ] Connect Wallet B and confirm registration
- [ ] Buy cards until total_spent ≥ 0.1 SOL
- [ ] Watch for ReferralQualified event in console
- [ ] Verify points awarded message appears
- [ ] Switch to Wallet A and check referrals count increased
- [ ] Check Wallet A got 100 pts (× NFT multiplier)
- [ ] Check Wallet B shows "Referred Bonus: ✅ 100 pts"

---

## Expected Results

After a successful test:

**Wallet A (Referrer):**
- Referrals: +1
- Points This Month: +100 (or +100 × NFT multiplier)

**Wallet B (Referee):**
- Referred By: Wallet A's address (visible in profile data)
- Referred Bonus: ✅ 100 pts (shown in green in Your Stats)
- Points This Month: +100 (from qualification bonus)
- Points from scratching: Variable (based on cards bought)

---

## Notes

- The `ReferralQualified` event only fires ONCE when crossing 0.1 SOL
- Points can only be awarded once per referral
- The monitor prevents duplicate awarding with a processed set
- Event listener runs as long as the page is open
- If you close/refresh, it restarts but won't re-award (smart contract prevents it)

---

## Troubleshooting

### "AlreadyReferred" Error
This wallet was already referred by someone else. Use a fresh wallet.

### "ReferralNotQualified" Error  
The referee hasn't spent 0.1 SOL yet. Buy more cards.

### No Event Firing
- Check if total_spent actually crossed 0.1 SOL threshold
- Look in Solana Explorer for your wallet's transactions
- The event fires from the smart contract, not the frontend

### Points Not Updating in UI
- Refresh the page
- The leaderboard refreshes every 2 seconds after a purchase
- Check on-chain data in Solana Explorer to verify points were actually awarded

---

## Files Changed

```
src/app/hooks/useReferralMonitor.ts    [NEW]
src/app/lib/constants.ts               [MODIFIED]
src/app/page.tsx                       [MODIFIED]
```

## Next Steps

1. Test thoroughly on devnet with two wallets
2. Once confirmed working, deploy to mainnet
3. Monitor console logs for any errors in production
4. Consider adding a toast notification when points are awarded
